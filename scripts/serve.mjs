import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav' };
http.createServer((req, res) => {
  let target;
  try { target = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); } catch { res.writeHead(400).end(); return; }
  if (target === root) target = path.join(root, 'index.html');
  if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404).end('Not found'); return; }
    res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream'); res.end(data);
  });
}).listen(4173, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4173'));
