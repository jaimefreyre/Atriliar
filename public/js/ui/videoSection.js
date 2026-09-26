export function renderVideoSection(song, container) {
  if (!song.references) return;
  
  const videos = [];
  
  if (song.references.youtube_studio) {
    videos.push({
      type: 'Studio',
      url: song.references.youtube_studio
    });
  }
  
  if (song.references.youtube_live) {
    videos.push({
      type: 'En Vivo',
      url: song.references.youtube_live
    });
  }
  
  if (song.references.youtube_tutorial) {
    videos.push({
      type: 'Tutorial',
      url: song.references.youtube_tutorial
    });
  }
  
  if (videos.length === 0) return;
  
  const section = document.createElement('div');
  section.className = 'video-section';
  section.innerHTML = '<h3>📹 Videos de Referencia</h3>';
  
  const grid = document.createElement('div');
  grid.className = 'video-grid';
  
  videos.forEach(video => {
    const videoId = extractVideoId(video.url);
    if (!videoId) return;
    
    const card = document.createElement('div');
    card.className = 'video-card';
    card.innerHTML = `
      <div class="video-thumbnail">
        <img src="https://img.youtube.com/vi/${videoId}/mqdefault.jpg" alt="${video.type}">
        <div class="video-type-badge">${video.type}</div>
      </div>
      <div class="video-actions">
        <a href="${video.url}" target="_blank" class="video-btn">▶ Ver en YouTube</a>
      </div>
    `;
    grid.appendChild(card);
  });
  
  section.appendChild(grid);
  container.appendChild(section);
}

function extractVideoId(url) {
  if (!url) return null;
  
  // Extraer ID de diferentes formatos de URL de YouTube
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}