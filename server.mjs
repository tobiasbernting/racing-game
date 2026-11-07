// Dependency-free static server for dist/. PORT (default 8080), GET /health -> 200 "ok", SPA fallback to
// index.html, long cache for hashed /assets/, no cache for index.html.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('./dist', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
};

async function fileFor(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const full = normalize(join(ROOT, p));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
  try {
    const s = await stat(full);
    if (s.isFile()) return { path: full, size: s.size, mtime: s.mtime };
  } catch {
    // not a file: fall back below
  }
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : 'ok');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end();
    return;
  }
  let file = url.pathname === '/' ? null : await fileFor(url.pathname);
  // a missing file with an extension is a real 404; anything else is a route of the single page app
  if (!file && extname(url.pathname) && url.pathname !== '/') {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  file ??= await fileFor('/index.html');
  if (!file) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('dist/ is missing: run pnpm build');
    return;
  }
  const ext = extname(file.path).toLowerCase();
  const isIndex = file.path === join(ROOT, 'index.html');
  const headers = {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    'content-length': file.size,
    'last-modified': file.mtime.toUTCString(),
    'x-content-type-options': 'nosniff',
    'cache-control': isIndex ? 'no-cache' : url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file.path)
    .on('error', () => res.destroy())
    .pipe(res);
});

server.listen(PORT, '0.0.0.0', () => console.log(`Galna Rallyt on :${PORT}`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
