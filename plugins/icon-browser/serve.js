import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const files = new Map([['/', ['index.html','text/html']], ['/index.html',['index.html','text/html']], ['/styles.css',['styles.css','text/css']], ['/main.js',['main.js','text/javascript']], ['/api.js',['api.js','text/javascript']]]);
const server = createServer(async (req, res) => {
  const file = files.get(new URL(req.url, 'http://127.0.0.1').pathname);
  if (!file || req.method !== 'GET') { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(new URL(file[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src blob:; connect-src https://api.iconify.design; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" });
    res.end(body);
  } catch { res.writeHead(500); res.end('Preview file unavailable'); }
});
server.listen(4318, '127.0.0.1', () => console.log('Icon Browser preview: http://127.0.0.1:4318'));
