'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.env.PORT || 4173);
const host = process.env.HM_PREVIEW_HOST || '127.0.0.1';
const root = path.join(__dirname, 'dist');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.ico':'image/x-icon','.txt':'text/plain','.xml':'application/xml'};

const server = http.createServer((req, res) => {
  let file;
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/intake-config') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({enabled:false, turnstileSiteKey:null, action:'brand_inquiry'}));
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(503, {'Content-Type':'application/json'});
      res.end('{"ok":false,"error":"Preview delivery disabled"}');
      return;
    }
    file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  } catch {
    res.writeHead(400, {'Content-Type':'text/plain; charset=utf-8'});
    res.end('Bad request');
    return;
  }

  if (!file.startsWith(root + path.sep) && file !== root) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch {
    let body = 'Not found';
    try {
      body = fs.readFileSync(path.join(root, '404.html'));
    } catch {
      // A missing preview build must still produce a response.
    }
    res.writeHead(404, {'Content-Type':'text/html; charset=utf-8'});
    res.end(body);
  }
});

server.listen(port, host, () => {
  const address = server.address();
  const hostname = address.family === 'IPv6' ? `[${address.address}]` : address.address;
  console.log(`Hammad Media preview at http://${hostname}:${address.port}`);
});
