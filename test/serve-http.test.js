import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { createLocalStaticServer, normalizeAllowedRoute } from '../scripts/local-static-server.mjs';

test('sunucu yolu yalnızca dist ve test/fixtures ağaçlarına izin verir', () => {
  assert.equal(normalizeAllowedRoute(''), 'test/fixtures/manual.html');
  assert.equal(normalizeAllowedRoute('/dist/filter.user.js'), 'dist/filter.user.js');
  assert.equal(normalizeAllowedRoute('/test/fixtures/manual.html'), 'test/fixtures/manual.html');

  for (const path of [
    '/.git/config',
    '/package-lock.json',
    '/userscript/main.js',
    '/dist/../package-lock.json',
    '/dist\\..\\package-lock.json',
    '/dist/.hidden.js',
    '/test/fixtures/../../package-lock.json',
  ]) {
    assert.throws(() => normalizeAllowedRoute(path));
  }
});

test('HTTP sunucusu izin listesini, kodlanmış traversal yollarını ve gerçek yol sınırını uygular', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'rdf-http-test-'));
  const root = join(base, 'repo');
  const outside = join(base, 'outside');
  await mkdir(join(root, 'dist'), { recursive: true });
  await mkdir(join(root, 'test', 'fixtures'), { recursive: true });
  await mkdir(join(root, '.git'), { recursive: true });
  await mkdir(join(root, 'userscript'), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(root, 'dist', 'filter.user.js'), 'dist-ok');
  await writeFile(join(root, 'test', 'fixtures', 'manual.html'), '<p>fixture-ok</p>');
  await writeFile(join(root, '.git', 'config'), 'secret');
  await writeFile(join(root, 'package-lock.json'), 'lock');
  await writeFile(join(root, 'userscript', 'main.js'), 'source');
  await writeFile(join(outside, 'secret.js'), 'outside-secret');

  let junctionCreated = false;
  try {
    await symlink(outside, join(root, 'dist', 'escape'), 'junction');
    junctionCreated = true;
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) throw error;
  }

  const server = createLocalStaticServer({ root, portForUrl: 0 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;

  t.after(async () => {
    server.close();
    await once(server, 'close');
    await rm(base, { recursive: true, force: true });
  });

  for (const [path, expectedBody] of [
    ['/', '<p>fixture-ok</p>'],
    ['/dist/filter.user.js', 'dist-ok'],
    ['/test/fixtures/manual.html', '<p>fixture-ok</p>'],
  ]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(await response.text(), expectedBody, path);
  }

  const denied = [
    '/.git/config',
    '/package-lock.json',
    '/userscript/main.js',
    '/../package-lock.json',
    '/%2e%2e/package-lock.json',
    '/dist/%2e%2e/package-lock.json',
    '/dist/%5c..%5cpackage-lock.json',
    '/dist/%00filter.user.js',
  ];
  if (junctionCreated) denied.push('/dist/escape/secret.js');

  for (const path of denied) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 404, path);
    assert.equal(await response.text(), 'Bulunamadı', path);
  }
});
