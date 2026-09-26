const http = require('http');
const fs = require('fs');
const path = require('path');

const PUBLIC_ROOT = path.resolve(__dirname, 'public');
const MIME_TYPES = Object.freeze({
  '.avif': 'image/avif', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm',
  '.wav': 'audio/wav', '.webm': 'audio/webm', '.webp': 'image/webp',
});

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
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end(req.method === 'HEAD' ? undefined : 'Method Not Allowed');
  }

  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch { res.writeHead(400); return res.end('Bad Request'); }

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
    res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': stat.size, 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); }).pipe(res);
  });
});

const port = Number(process.env.PORT || 3000);
server.listen(port, 'localhost', () => {
  console.log(`\n🎸 StagePrompter Ready\nLocal: http://localhost:${port}\n`);
});
