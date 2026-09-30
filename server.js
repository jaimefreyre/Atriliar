const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PUBLIC_ROOT = path.resolve(__dirname, 'public');
const SEPARATOR_SCRIPT = path.join(__dirname, 'scripts', 'separate_stems.py');
const SEPARATOR_ROOT = path.join(os.tmpdir(), 'stageprompter-separation');
const SEPARATOR_MODELS = new Set(['htdemucs', 'htdemucs_6s']);
const SEPARATOR_STEMS = ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano'];
const SEPARATOR_JOBS = new Map();
const MAX_SEPARATION_BYTES = 256 * 1024 * 1024;
const PYTHON = process.env.STAGEPROMPTER_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const MIME_TYPES = Object.freeze({
  '.avif': 'image/avif', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm',
  '.wav': 'audio/wav', '.webm': 'audio/webm', '.webp': 'image/webp',
});

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function runSeparatorCheck() {
  return new Promise((resolve) => {
    const child = spawn(PYTHON, [SEPARATOR_SCRIPT, '--check'], { windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    const timer = setTimeout(() => { child.kill(); resolve({ available: false, message: 'La comprobación del separador tardó demasiado.' }); }, 8000);
    child.on('error', () => { clearTimeout(timer); resolve({ available: false, message: `No se encontró Python (${PYTHON}). Instala Python y Demucs para habilitar la separación local.` }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ available: true, message: 'Demucs listo para separar en este equipo.' });
      else resolve({ available: false, message: output.trim().split(/\r?\n/).at(-1) || 'Demucs no está instalado.' });
    });
  });
}

function runSeparation(job, inputPath) {
  job.status = 'processing';
  job.message = `Separando con ${job.model}; la primera ejecución puede descargar el modelo.`;
  const child = spawn(PYTHON, [SEPARATOR_SCRIPT, '--model', job.model, '--input', inputPath, '--output', job.outputDir], {
    windowsHide: true,
  });
  job.process = child;
  let tail = '';
  child.stdout.on('data', (chunk) => {
    tail = `${tail}${chunk.toString()}`.slice(-3000);
    const latest = tail.split(/\r?\n/).filter(Boolean).at(-1);
    if (latest) job.message = latest.slice(0, 300);
  });
  child.stderr.on('data', (chunk) => {
    tail = `${tail}${chunk.toString()}`.slice(-3000);
    const latest = tail.split(/\r?\n/).filter(Boolean).at(-1);
    if (latest) job.message = latest.slice(0, 300);
  });
  child.on('error', (error) => { job.status = 'failed'; job.message = error.message; job.process = null; });
  child.on('close', async (code) => {
    job.process = null;
    if (code !== 0) {
      job.status = 'failed';
      job.message = tail.trim().split(/\r?\n/).at(-1) || `Demucs terminó con código ${code}.`;
      return;
    }
    const songName = path.basename(inputPath, path.extname(inputPath));
    const folder = path.join(job.outputDir, job.model, songName);
    const stems = [];
    for (const name of SEPARATOR_STEMS) {
      const stemPath = path.join(folder, `${name}.wav`);
      try {
        const stat = await fs.promises.stat(stemPath);
        if (stat.isFile()) stems.push({ name, bytes: stat.size, url: `/api/stems/${job.id}/${name}` });
      } catch { /* el modelo elegido puede no producir ese instrumento */ }
    }
    if (!stems.length) { job.status = 'failed'; job.message = 'Demucs terminó, pero no se encontraron sus pistas de salida.'; return; }
    job.stems = stems;
    job.status = 'completed';
    job.message = `Separación terminada · ${stems.length} pistas.`;
    job.completedAt = Date.now();
  });
}

async function acceptSeparation(req, res, model, extension) {
  if (!SEPARATOR_MODELS.has(model)) return json(res, 400, { error: 'Modelo de separación inválido.' });
  const allowedExtensions = new Set(['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm', '.mp4']);
  if (!allowedExtensions.has(extension)) return json(res, 415, { error: 'Formato de audio no compatible.' });
  const declaredLength = Number(req.headers['content-length'] || 0);
  if (declaredLength > MAX_SEPARATION_BYTES) return json(res, 413, { error: 'El archivo supera el límite local de 256 MB.' });
  const id = crypto.randomUUID();
  const jobDir = path.join(SEPARATOR_ROOT, id);
  const inputPath = path.join(jobDir, `source${extension}`);
  try { await fs.promises.mkdir(jobDir, { recursive: true }); }
  catch (error) { return json(res, 500, { error: `No se pudo preparar la carpeta temporal: ${error.message}` }); }
  const outputDir = path.join(jobDir, 'output');
  const output = fs.createWriteStream(inputPath, { flags: 'wx' });
  let bytes = 0, rejected = false;
  req.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > MAX_SEPARATION_BYTES && !rejected) {
      rejected = true; req.unpipe(output); output.destroy(); req.resume();
      json(res, 413, { error: 'El archivo supera el límite local de 256 MB.' });
      fs.promises.rm(jobDir, { recursive: true, force: true }).catch(() => {});
    }
  });
  req.on('aborted', () => { output.destroy(); fs.promises.rm(jobDir, { recursive: true, force: true }).catch(() => {}); });
  output.on('error', (error) => {
    if (!rejected && !res.headersSent) json(res, 500, { error: `No se pudo guardar el audio temporal: ${error.message}` });
  });
  output.on('finish', () => {
    if (rejected) return;
    if (!bytes) { fs.promises.rm(jobDir, { recursive: true, force: true }).catch(() => {}); return json(res, 400, { error: 'El archivo recibido está vacío.' }); }
    const job = { id, model, outputDir, status: 'queued', message: 'Audio recibido; iniciando separación local.', createdAt: Date.now(), stems: [] };
    SEPARATOR_JOBS.set(id, job);
    json(res, 202, { id, status: job.status, message: job.message });
    runSeparation(job, inputPath);
  });
  req.pipe(output);
}

function resolvePublicPath(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (/[\u0000-\u001f]/.test(decoded)) return null;
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_ROOT, relative);
  const fromRoot = path.relative(PUBLIC_ROOT, filePath);
  if (fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) return null;
  return filePath;
}

const server = http.createServer((req, res) => {
  let requestUrl;
  try { requestUrl = new URL(req.url, 'http://localhost'); }
  catch { res.writeHead(400); return res.end('Bad Request'); }
  const pathname = requestUrl.pathname;

  if (pathname === '/api/separation/status' && req.method === 'GET') {
    return runSeparatorCheck().then((state) => json(res, 200, state));
  }
  if (pathname === '/api/separate' && req.method === 'POST') {
    return acceptSeparation(req, res, requestUrl.searchParams.get('model') || 'htdemucs',
      path.extname(requestUrl.searchParams.get('name') || '').toLowerCase());
  }
  const jobStatusMatch = pathname.match(/^\/api\/separate\/([\da-f-]{36})$/i);
  if (jobStatusMatch && req.method === 'GET') {
    const job = SEPARATOR_JOBS.get(jobStatusMatch[1]);
    return job ? json(res, 200, { id: job.id, status: job.status, message: job.message, stems: job.stems })
      : json(res, 404, { error: 'No se encontró este proceso de separación.' });
  }
  const stemMatch = pathname.match(/^\/api\/stems\/([\da-f-]{36})\/(vocals|drums|bass|other|guitar|piano)$/i);
  if (stemMatch && req.method === 'GET') {
    const job = SEPARATOR_JOBS.get(stemMatch[1]);
    if (!job || job.status !== 'completed' || !SEPARATOR_STEMS.includes(stemMatch[2].toLowerCase())) {
      return json(res, 404, { error: 'La pista separada ya no está disponible.' });
    }
    const filePath = path.join(job.outputDir, job.model, 'source', `${stemMatch[2].toLowerCase()}.wav`);
    return fs.stat(filePath, (error, stat) => {
      if (error || !stat.isFile()) return json(res, 404, { error: 'No se encontró la pista.' });
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = Math.min(range[2] ? Number(range[2]) : stat.size - 1, stat.size - 1);
        if (start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); return res.end(); }
        res.writeHead(206, { 'Content-Type': 'audio/wav', 'Content-Length': end - start + 1,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
        return fs.createReadStream(filePath, { start, end }).pipe(res);
      }
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': stat.size,
        'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
      fs.createReadStream(filePath).pipe(res);
    });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end(req.method === 'HEAD' ? undefined : 'Method Not Allowed');
  }

  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok' }));
  }

  const filePath = resolvePublicPath(pathname);
  if (!filePath) { res.writeHead(403); return res.end(req.method === 'HEAD' ? undefined : 'Forbidden'); }
  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404);
      return res.end(req.method === 'HEAD' ? undefined : '404 Not Found');
    }
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': contentType, 'Content-Length': stat.size, 'X-Content-Type-Options': 'nosniff' };
    if (['.html', '.css', '.js'].includes(path.extname(filePath).toLowerCase())) {
      headers['Cache-Control'] = 'no-cache, must-revalidate';
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); }).pipe(res);
  });
});

const port = Number(process.env.PORT || 3000);
server.listen(port, 'localhost', () => {
  console.log(`\n🎸 StagePrompter Ready\nLocal: http://localhost:${port}\n`);
});
