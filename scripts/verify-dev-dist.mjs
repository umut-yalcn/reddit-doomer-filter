import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const production = await readFile(join(ROOT, 'dist', 'reddit-doom-filter.user.js'), 'utf8');
const developmentPath = join(ROOT, 'dist', 'reddit-doom-filter.dev.user.js');
const development = await readFile(developmentPath, 'utf8');
const metadata = Object.fromEntries(
  [...development.matchAll(/^\/\/ @(\w+)\s+(.+)$/gm)].map((match) => [match[1], match[2].trim()]),
);

assert.equal(metadata.name, 'Reddit Karamsarlık Filtresi DEV');
assert.equal(metadata.namespace, `${String(packageJson.homepage).replace(/\/$/, '')}/dev`);
assert.equal(metadata.version, `${packageJson.version}-dev`);
assert.doesNotMatch(development, /^\/\/ @updateURL/m);
assert.doesNotMatch(development, /^\/\/ @downloadURL/m);
assert.match(development, /rdf_personal_rules_v1/);
assert.notEqual(development, production);

execFileSync(process.execPath, [join(ROOT, 'build-dev.mjs')], {
  cwd: ROOT,
  stdio: 'pipe',
});
const rebuilt = await readFile(developmentPath, 'utf8');
assert.equal(
  rebuilt,
  development,
  `DEV build deterministik değil: ${createHash('sha256').update(development).digest('hex')}`,
);

console.log('DEV dist doğrulandı · dinamik sürüm · ayrı namespace · deterministik build · otomatik güncelleme kapalı');
