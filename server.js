// Serves the WebGL build in ./WebBuild on http://127.0.0.1:8080/ (this computer only). No dependencies, just Node.js.
//   node server.js            start the server
//   node server.js --open     start it and open the game in your default browser
//   node server.js 9000       use another port
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = path.join(__dirname, 'WebBuild');
const PORT = parseInt(process.argv.find((a) => /^\d+$/.test(a)) || '8080', 10);
const HOST = '127.0.0.1';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('No build found in ' + ROOT + ' (index.html is missing). Build the project for WebGL first.');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.writeHead(400);
    return res.end('Bad request');
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.normalize(path.join(ROOT, pathname));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    // Unity can pre-compress the build (.br = Brotli, .gz = gzip): send those with the matching Content-Encoding
    let typeName = file;
    const headers = { 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
    const ext = path.extname(file).toLowerCase();
    if (ext === '.br') { headers['Content-Encoding'] = 'br'; typeName = file.slice(0, -3); }
    else if (ext === '.gz') { headers['Content-Encoding'] = 'gzip'; typeName = file.slice(0, -3); }
    headers['Content-Type'] = TYPES[path.extname(typeName).toLowerCase()] || 'application/octet-stream';
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    let start = 0;
    let end = stat.size - 1;
    let status = 200;
    if (range && (range[1] !== '' || range[2] !== '')) {
      if (range[1] === '') {
        start = Math.max(0, stat.size - parseInt(range[2], 10));
      } else {
        start = parseInt(range[1], 10);
        if (range[2] !== '') end = Math.min(end, parseInt(range[2], 10));
      }
      if (start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size });
        return res.end();
      }
      status = 206;
      headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file, { start, end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' is already in use. If the game server is already running, just open http://' + HOST + ':' + PORT + '/ ;');
    console.error('otherwise pick another port, e.g.  node server.js 9000');
  } else {
    console.error(e);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const url = 'http://' + HOST + ':' + PORT + '/';
  console.log('Serving ' + ROOT);
  console.log('Open ' + url + ' in Chrome or Edge.  (Ctrl+C to stop)');
  if (process.argv.includes('--open')) exec('start "" "' + url + '"');
});
