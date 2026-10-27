// Serves the WebGL build in ./WebBuild. No dependencies, just Node.js.
//   node server.js              listen on 0.0.0.0:8080 (this computer and other devices on your local network)
//   node server.js --local      listen on 127.0.0.1 only (this computer only)
//   node server.js --open       also open the game in your default browser
//   node server.js 9000         use another port
//   node server.js --host=192.168.1.20   listen on one specific address
// Make sure the port is not forwarded to the internet: the build contains the game's assets.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { exec } = require('child_process');

const ROOT = path.join(__dirname, 'WebBuild');
const PORT = parseInt(process.argv.find((a) => /^\d+$/.test(a)) || process.env.PORT || '8080', 10);
const hostArg = process.argv.find((a) => a.startsWith('--host='));
const HOST = process.argv.includes('--local') ? '127.0.0.1' : hostArg ? hostArg.slice(7) : process.env.HOST || '0.0.0.0';
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
    const headers = { 'Cache-Control': 'no-store' };
    const ext = path.extname(file).toLowerCase();
    let typeName = file;
    let precompressed = null;
    if (ext === '.br') { precompressed = 'br'; typeName = file.slice(0, -3); }
    else if (ext === '.gz') { precompressed = 'gzip'; typeName = file.slice(0, -3); }
    headers['Content-Type'] = TYPES[path.extname(typeName).toLowerCase()] || 'application/octet-stream';

    // Browsers only accept Brotli over https or localhost. A page opened through a LAN address (plain http) does not
    // advertise "br", so for those clients the file is decompressed on the fly and sent as plain bytes.
    const accepted = String(req.headers['accept-encoding'] || '');
    const clientCanDecode = precompressed && new RegExp('\\b' + precompressed + '\\b').test(accepted);
    if (precompressed && !clientCanDecode) {
      res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end();
      const src = fs.createReadStream(file);
      const dec = precompressed === 'br' ? zlib.createBrotliDecompress() : zlib.createGunzip();
      src.on('error', () => res.destroy());
      dec.on('error', () => res.destroy());
      res.on('close', () => { src.destroy(); dec.destroy(); });
      return src.pipe(dec).pipe(res);
    }
    if (precompressed) headers['Content-Encoding'] = precompressed;
    headers['Accept-Ranges'] = 'bytes';

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
    console.error('Port ' + PORT + ' is already in use. If the game server is already running, just open http://127.0.0.1:' + PORT + '/ ;');
    console.error('otherwise pick another port, e.g.  node server.js 9000');
  } else {
    console.error(e);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('Serving ' + ROOT);
  console.log('Listening on ' + HOST + ':' + PORT + '   (Ctrl+C to stop)');
  console.log('  this computer:   http://127.0.0.1:' + PORT + '/');
  if (HOST === '0.0.0.0' || HOST === '::') {
    const nets = os.networkInterfaces();
    Object.keys(nets).forEach((name) => nets[name].forEach((n) => {
      if (n.family === 'IPv4' && !n.internal) console.log('  local network:   http://' + n.address + ':' + PORT + '/   (' + name + ')');
    }));
    console.log('Windows may ask to allow Node.js through the firewall: allow it for private networks only.');
  }
  if (process.argv.includes('--open')) exec('start "" "http://127.0.0.1:' + PORT + '/"');
});
