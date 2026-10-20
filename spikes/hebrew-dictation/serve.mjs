// Tiny static server so the page runs on localhost (the browser allows the microphone there).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8' };
createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = await readFile(join(root, path.replace(/\.\./g, '')));
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(8765, '127.0.0.1', () => console.log('Open http://localhost:8765 . Close this window to stop.'));
