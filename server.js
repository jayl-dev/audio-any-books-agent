const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Usage:
//   node server.js [folder]            serve players found in folder (default: this repo)
//   node server.js --dir <folder>      same, with an explicit flag
//   node server.js --host 0.0.0.0      also allow other devices on your network (e.g. a phone)
//   npm start -- <folder>
// The folder can also be set with the AUDIOBOOK_DIR environment variable, and PORT sets the port.
// The home page can switch to another folder while the server runs (only from this computer).
const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};
const positional = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
// Only this computer can connect unless another host is requested, since the served folder may hold personal files
const HOST = getArg('host') || '127.0.0.1';
const LOCAL_ONLY = HOST === '127.0.0.1' || HOST === 'localhost';
let rootDir = path.resolve(getArg('dir') || positional || process.env.AUDIOBOOK_DIR || __dirname);

if (!isDirectory(rootDir)) {
  console.error(`Folder not found: ${rootDir}`);
  console.error('Usage: node server.js [folder]   (or --dir <folder>)');
  process.exit(1);
}

function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch (_) {
    return false;
  }
}

// Players are written next to their book PDFs, so search subfolders too
function findPlayers(dir = rootDir, depth = 0) {
  let results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return results; // unreadable folder (permissions, etc.)
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (depth < 3 && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        results = results.concat(findPlayers(path.join(dir, entry.name), depth + 1));
      }
    } else if (entry.name.endsWith('_player.html')) {
      results.push(path.relative(rootDir, path.join(dir, entry.name)).split(path.sep).join('/'));
    }
  }
  return results.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

// Folder switching exposes the file system, so it is allowed only when the server listens on this
// computer alone, and only for requests addressed to localhost (which also blocks DNS-rebinding tricks)
function canSwitchFolders(req) {
  if (!LOCAL_ONLY) return false;
  const host = String(req.headers.host || '');
  if (!new RegExp(`^(localhost|127\\.0\\.0\\.1|\\[::1\\]):${PORT}$`).test(host)) return false;
  const origin = req.headers.origin;
  return !origin || origin === `http://${host}`;
}

// Subfolders of a folder for the folder browser; an empty path lists the drives on Windows
function listFolder(dirPath) {
  if (!dirPath && process.platform === 'win32') {
    const drives = [];
    for (let c = 65; c <= 90; c++) {
      const drive = `${String.fromCharCode(c)}:\\`;
      if (isDirectory(drive)) drives.push({ name: drive, path: drive });
    }
    return { path: '', parent: null, folders: drives, players: 0 };
  }
  const dir = path.resolve(dirPath || rootDir);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const folders = entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('$'))
    .map(e => ({ name: e.name, path: path.join(dir, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const players = entries.filter(e => e.isFile() && e.name.endsWith('_player.html')).length;
  const up = path.dirname(dir);
  const parent = up !== dir ? up : (process.platform === 'win32' ? '' : null);
  return { path: dir, parent, folders, players };
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 10000) reject(new Error('Request too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const playerUrl = f => '/' + f.split('/').map(encodeURIComponent).join('/');

function indexPage(playerFiles, switchable) {
  const items = playerFiles.map(f => `<li><a href="${playerUrl(f)}">${escapeHtml(f.replace(/_player\.html$/, '').replace(/_/g, ' '))}</a> <span class="path">${escapeHtml(f)}</span></li>`).join('');
  const picker = switchable ? `
  <details id="picker" ${playerFiles.length ? '' : 'open'}>
    <summary>${playerFiles.length ? 'Choose a different folder' : 'Choose a folder with your players'}</summary>
    <form id="path-form">
      <input id="path-input" type="text" placeholder="Paste a folder path, e.g. C:\\Users\\you\\books" autocomplete="off">
      <button type="submit">Go</button>
    </form>
    <div class="browser">
      <div class="crumb"><button type="button" id="up-btn" title="Parent folder">&uarr; Up</button> <span id="current"></span></div>
      <ul id="folders"></ul>
    </div>
    <div class="actions"><button type="button" id="use-btn" class="primary">Serve this folder</button> <span id="status"></span></div>
  </details>` : `
  <p class="hint">To serve a different folder, restart the server with <code>node server.js "path/to/folder"</code>.
  Folder switching from this page is turned off while the server is open to your network.</p>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Audio Any Books Player Server</title>
  <style>
    :root { --bg: #0f172a; --panel: rgba(255,255,255,0.05); --line: rgba(255,255,255,0.12); --text: #f8fafc; --muted: #94a3b8; --brand: #38bdf8; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", sans-serif; padding: 32px 16px; max-width: 760px; margin: 0 auto; background: var(--bg); color: var(--text); }
    a { color: var(--brand); }
    li { margin: 8px 0; }
    .path { color: var(--muted); font-size: 0.85em; margin-left: 6px; word-break: break-all; }
    code { background: var(--panel); padding: 1px 5px; border-radius: 4px; word-break: break-all; }
    .hint { color: var(--muted); font-size: 0.9em; margin-top: 28px; line-height: 1.6; }
    details { margin-top: 28px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
    summary { cursor: pointer; font-weight: 600; }
    form { display: flex; gap: 8px; margin: 14px 0 10px; }
    input { flex: 1; min-width: 0; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--line); background: #0b1222; color: var(--text); }
    button { padding: 7px 12px; border-radius: 6px; border: 1px solid var(--line); background: rgba(255,255,255,0.08); color: var(--text); cursor: pointer; }
    button:hover { border-color: var(--brand); }
    button.primary { background: var(--brand); color: #0b1222; border-color: var(--brand); font-weight: 600; }
    .crumb { display: flex; align-items: center; gap: 10px; font-size: 0.9em; color: var(--muted); word-break: break-all; }
    #folders { list-style: none; padding: 0; margin: 10px 0; max-height: 320px; overflow-y: auto; border-top: 1px solid var(--line); }
    #folders li { margin: 0; }
    #folders button { width: 100%; text-align: left; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: none; padding: 8px 6px; }
    #folders button:hover { background: rgba(56,189,248,0.12); }
    .badge { color: var(--brand); font-size: 0.85em; margin-left: 6px; }
    .actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    #status { color: var(--muted); font-size: 0.9em; }
    #status.error { color: #f87171; }
  </style>
</head>
<body>
  <h1>Audio Any Books Player Server</h1>
  <p>Serving <code>${escapeHtml(rootDir)}</code></p>
  ${playerFiles.length
    ? `<ul>${items}</ul>`
    : `<p>No <code>*_player.html</code> files found in this folder or its subfolders.${switchable ? ' Choose the folder where your players were generated (usually the book&#39;s folder):' : ''}</p>`}
  ${picker}
  ${switchable ? `<script>
    let browsing = ${JSON.stringify(rootDir)};
    let parent = null;
    const folders = document.getElementById('folders');
    const current = document.getElementById('current');
    const status = document.getElementById('status');
    const upBtn = document.getElementById('up-btn');
    const setStatus = (text, isError) => { status.textContent = text; status.className = isError ? 'error' : ''; };

    async function browse(dirPath) {
      setStatus('');
      const res = await fetch('/__browse?path=' + encodeURIComponent(dirPath));
      const data = await res.json();
      if (!res.ok) return setStatus(data.error || 'Could not open that folder.', true);
      browsing = data.path;
      parent = data.parent;
      current.textContent = data.path || 'This computer';
      upBtn.disabled = parent === null;
      folders.innerHTML = '';
      for (const f of data.folders) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = f.name + (/[\\\\/]$/.test(f.name) ? '' : '/');
        b.onclick = () => browse(f.path);
        li.appendChild(b);
        folders.appendChild(li);
      }
      if (!data.folders.length) folders.innerHTML = '<li style="padding:8px 6px;color:#94a3b8">No subfolders</li>';
      if (data.players) setStatus(data.players + ' player' + (data.players > 1 ? 's' : '') + ' in this folder');
      document.getElementById('use-btn').disabled = !data.path;
    }

    upBtn.onclick = () => parent !== null && browse(parent);
    document.getElementById('path-form').onsubmit = (e) => {
      e.preventDefault();
      const p = document.getElementById('path-input').value.trim().replace(/^"|"$/g, '');
      if (p) browse(p);
    };
    document.getElementById('use-btn').onclick = async () => {
      setStatus('Switching...');
      const res = await fetch('/__root', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: browsing }) });
      const data = await res.json();
      if (!res.ok) return setStatus(data.error || 'Could not switch folders.', true);
      location.href = '/';
    };
    browse(browsing);
  </script>` : ''}
</body>
</html>`;
}

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

const server = http.createServer(async (req, res) => {
  let reqPath;
  let query;
  try {
    const url = new URL(req.url, 'http://localhost');
    reqPath = decodeURIComponent(url.pathname);
    query = url.searchParams;
  } catch (_) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  // Folder browser API (this computer only)
  if (reqPath === '/__browse' || reqPath === '/__root') {
    if (!canSwitchFolders(req)) return sendJson(res, 403, { error: 'Folder switching is only available from this computer.' });
    if (reqPath === '/__browse') {
      try {
        return sendJson(res, 200, listFolder(query.get('path') || ''));
      } catch (err) {
        return sendJson(res, 400, { error: `Cannot open that folder (${err.code || err.message}).` });
      }
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST' });
    try {
      const { path: newRoot } = JSON.parse(await readBody(req));
      const resolved = path.resolve(String(newRoot || ''));
      if (!newRoot || !isDirectory(resolved)) return sendJson(res, 400, { error: 'That folder does not exist.' });
      rootDir = resolved;
      const players = findPlayers();
      console.log(`\nNow serving: ${rootDir} (${players.length} player${players.length === 1 ? '' : 's'})`);
      return sendJson(res, 200, { path: rootDir, players });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // The home page lists every player found; a single player opens directly
  if (reqPath === '/' || reqPath === '') {
    const playerFiles = findPlayers();
    if (playerFiles.length === 1 && !query.has('list')) {
      res.writeHead(302, { Location: playerUrl(playerFiles[0]) });
      res.end();
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(indexPage(playerFiles, canSwitchFolders(req)));
    }
    return;
  }

  const filePath = path.resolve(rootDir, '.' + reqPath);

  // Security check: ensure within the served folder
  if (filePath !== rootDir && !filePath.startsWith(rootDir + path.sep)) {
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

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use; the server may already be running (open http://localhost:${PORT}/).`);
    console.error('To run another copy, choose a different port, e.g. set PORT=3001.');
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const playerFiles = findPlayers();
  const base = `http://localhost:${PORT}`;
  const firstUrl = playerFiles.length === 1 ? base + playerUrl(playerFiles[0]) : `${base}/`;

  console.log(`\n======================================================`);
  console.log(`  Audio Any Books - Local Streaming Server`);
  console.log(`======================================================`);
  console.log(`Serving folder:    ${rootDir}`);
  console.log(`Server running at: ${base}/${LOCAL_ONLY ? ' (this computer only; use --host 0.0.0.0 for other devices)' : ` (listening on ${HOST}; folder switching from the page is off)`}`);

  if (playerFiles.length > 0) {
    console.log(`\nDetected Players:`);
    playerFiles.forEach(f => {
      console.log(`  * ${base}${playerUrl(f)}`);
    });
  } else {
    console.log(`\nNo *_player.html files detected under ${rootDir} yet.`);
  }
  console.log(`\nTo serve a different folder, use the folder picker at ${base}/?list or run: node server.js "path/to/folder"`);

  if (!args.includes('--no-open')) {
    console.log(`\nOpening default browser...\n`);
    const openCmd = process.platform === 'win32' ? `start "" "${firstUrl}"` : process.platform === 'darwin' ? `open "${firstUrl}"` : `xdg-open "${firstUrl}"`;
    exec(openCmd, () => {});
  }
});
