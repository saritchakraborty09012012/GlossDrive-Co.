const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 8077;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function createServer() {
  return http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    const file = path.normalize(path.join(ROOT, urlPath));
    if (!file.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }

    const imgDelay = Number(process.env.IMG_DELAY_MS) || 0;
    const delay = imgDelay && /\.jpe?g$/i.test(file) ? imgDelay : 0;
    setTimeout(() => {
      fs.readFile(file, (err, buf) => {
        if (err) {
          res.writeHead(404);
          res.end('not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store'
        });
        res.end(buf);
      });
    }, delay);
  });
}

if (require.main === module) {
  createServer().listen(PORT, '127.0.0.1', () => {
    const imgDelay = Number(process.env.IMG_DELAY_MS) || 0;
    console.log('Serving public/ at http://localhost:' + PORT);
    if (imgDelay) console.log('Simulated slow network: images delayed ' + imgDelay + 'ms each');
  });
}

module.exports = { createServer, ROOT };
