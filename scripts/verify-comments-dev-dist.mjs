import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const production = await readFile(join(ROOT, 'dist', 'reddit-doom-filter.user.js'), 'utf8');
const developmentPath = join(ROOT, 'dist', 'reddit-doom-filter.comments-dev.user.js');
const development = await readFile(developmentPath, 'utf8');
const metadata = Object.fromEntries(
  [...development.matchAll(/^\/\/ @(\w+)\s+(.+)$/gm)].map((match) => [match[1], match[2].trim()]),
);
const developmentVersion = '0.4.0-hardened-dev';

assert.equal(metadata.name, 'Reddit Karamsarlık Filtresi Yorum DEV');
assert.equal(metadata.namespace, `${String(packageJson.homepage).replace(/\/$/, '')}/comments-dev`);
assert.equal(metadata.version, developmentVersion);
assert.equal(metadata.sandbox, 'DOM');
assert.doesNotMatch(development, /^\/\/ @updateURL/m);
assert.doesNotMatch(development, /^\/\/ @downloadURL/m);
assert.match(development, /shreddit-comment/);
assert.match(development, /Yorum filtresini kapat/);
assert.match(development, /Daima göster/);
assert.match(development, /Benzer yorumları daima göster/);
assert.match(development, /Kişisel kuralları içe aktar/);
assert.match(development, /Tekrar gizle/);
assert.doesNotMatch(development, /__redditDoomFilter/);
assert.doesNotMatch(development, /localStorage\.(?:getItem|setItem)/);
assert.notEqual(development, production);

execFileSync(process.execPath, [join(ROOT, 'build-comments-dev.mjs')], { cwd: ROOT, stdio: 'pipe' });
assert.equal(await readFile(developmentPath, 'utf8'), development);
console.log('Birleşik DEV dist doğrulandı · aynı test kimliği · deterministik · otomatik güncelleme kapalı');
