import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { createServer } from 'node:http';
import { resolvePathWithinRoot } from './path-safety.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const DEFAULT_DOCUMENT = 'test/fixtures/manual.html';

export function normalizeAllowedRoute(requestedPath) {
  const normalized = String(requestedPath ?? '')
    .replaceAll('\\', '/')
    .replace(/^\/+/, '');
  const route = normalized || DEFAULT_DOCUMENT;
  const segments = route.split('/');

  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) {
    throw new Error('Geçersiz sunucu yolu');
  }

  const inDist = segments[0] === 'dist' && segments.length >= 2;
  const inFixture = segments[0] === 'test' && segments[1] === 'fixtures' && segments.length >= 3;
  if (!inDist && !inFixture) throw new Error('Sunulmasına izin verilmeyen yol');

  return segments.join('/');
}

export function createLocalStaticServer({ root, portForUrl = 4173 }) {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, `http://127.0.0.1:${portForUrl}`).pathname;
      const route = normalizeAllowedRoute(decodeURIComponent(pathname));
      const path = await resolvePathWithinRoot(root, route);
      const info = await stat(path);
      if (!info.isFile()) throw new Error('Dosya değil');

      response.writeHead(200, {
        'content-type': TYPES[extname(path)] || 'application/octet-stream',
        'x-content-type-options': 'nosniff',
      });
      createReadStream(path).pipe(response);
    } catch {
      response.writeHead(404, {
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff',
      });
      response.end('Bulunamadı');
    }
  });
}
