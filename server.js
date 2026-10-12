/* 局域网静态服务：node server.js [端口] */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.argv[2]) || 5200;
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  if (req.url === '/' || req.url.startsWith('/assets')) {
    console.log(new Date().toISOString(), req.url, '|', req.headers['user-agent']);
  }
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(port, '0.0.0.0', () => console.log('serving ' + root + ' on 0.0.0.0:' + port));
