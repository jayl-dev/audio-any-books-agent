const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
  '.vtt': 'text/vtt; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') {
    const playerFiles = fs.readdirSync(ROOT_DIR).filter(f => f.endsWith('_player.html'));
    if (playerFiles.length > 0) {
      reqPath = '/' + playerFiles[0];
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Audio Any Books Agent Server</title></head>
        <body style="font-family: sans-serif; padding: 40px; background: #0f172a; color: #f8fafc;">
          <h1>Audio Any Books Agent</h1>
          <p>No <code>*_player.html</code> files found in the root directory yet.</p>
          <p>Generate one using <code>node scripts/generate_chapter_voiceover.js</code>!</p>
        </body>
        </html>
      `);
      return;
    }
  }

  const filePath = path.join(ROOT_DIR, reqPath);

  // Security check: ensure within ROOT_DIR
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File Not Found: ' + reqPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const totalSize = stats.size;

    // Handle HTTP Range Requests for smooth audio and PDF seeking
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
        res.end();
        return;
      }

      const chunkSize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

server.listen(PORT, () => {
  const playerFiles = fs.readdirSync(ROOT_DIR).filter(f => f.endsWith('_player.html'));
  const firstUrl = playerFiles.length > 0 ? `http://localhost:${PORT}/${playerFiles[0]}` : `http://localhost:${PORT}/`;

  console.log(`\n======================================================`);
  console.log(`  Audio Any Books - Local Streaming Server`);
  console.log(`======================================================`);
  console.log(`Server running at: http://localhost:${PORT}/`);

  if (playerFiles.length > 0) {
    console.log(`\nDetected Players:`);
    playerFiles.forEach(f => {
      console.log(`  * http://localhost:${PORT}/${f}`);
    });
  } else {
    console.log(`\nNo *_player.html files detected in root directory yet.`);
  }

  console.log(`\nOpening default browser...\n`);
  const openCmd = process.platform === 'win32' ? `start ${firstUrl}` : process.platform === 'darwin' ? `open ${firstUrl}` : `xdg-open ${firstUrl}`;
  exec(openCmd, () => {});
});
