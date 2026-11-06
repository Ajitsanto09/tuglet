// Serves the local sample page (and E2E fixtures) at http://localhost:4173 with no dependencies.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dirs = { '/': 'demo', '/fixtures/': 'tests/e2e/fixtures' };
const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 4173;

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const prefix = url.pathname.startsWith('/fixtures/') ? '/fixtures/' : '/';
  let rel = url.pathname.slice(prefix.length) || 'index.html';
  if (url.pathname.startsWith('/fixtures/spa/')) rel = 'spa.html'; // SPA deep links
  const file = path.resolve(root, dirs[prefix], rel);
  if (!file.startsWith(path.resolve(root, dirs[prefix]))) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    const headers = { 'content-type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' };
    if (rel.startsWith('strict')) headers['content-security-policy'] = "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'";
    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, '::', () => console.log(`Tuglet sample page: http://localhost:${port}/`));
