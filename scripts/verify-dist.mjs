import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist', 'reddit-doom-filter.user.js');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const before = await readFile(DIST, 'utf8');
const metadata = Object.fromEntries(
  [...before.matchAll(/^\/\/ @(\w+)\s+(.+)$/gm)].map((match) => [match[1], match[2].trim()]),
);
const repositoryUrl = String(packageJson.homepage).replace(/\/$/, '');
const distributionUrl = `${repositoryUrl.replace('https://github.com/', 'https://raw.githubusercontent.com/')}/main/dist/reddit-doom-filter.user.js`;
const expectedMetadata = {
  namespace: repositoryUrl,
  version: packageJson.version,
  homepageURL: repositoryUrl,
  supportURL: packageJson.bugs.url,
  updateURL: distributionUrl,
  downloadURL: distributionUrl,
  sandbox: 'DOM',
};

for (const [key, expected] of Object.entries(expectedMetadata)) {
  if (metadata[key] !== expected) {
    throw new Error(`Metadata uyuşmazlığı: @${key}=${metadata[key] ?? 'yok'}, beklenen=${expected}`);
  }
}

execFileSync(process.execPath, [join(ROOT, 'build.mjs')], {
  cwd: ROOT,
  stdio: 'pipe',
});

const after = await readFile(DIST, 'utf8');
if (before !== after) {
  throw new Error(`Build deterministik değil: ${sha256(before)} != ${sha256(after)}`);
}

if (/__redditDoomFilter/.test(after)) throw new Error('Global debug yüzeyi dist içinde olmamalı.');
if (/localStorage\.(?:getItem|setItem)/.test(after)) throw new Error('Reddit localStorage kullanımı dist içinde olmamalı.');

console.log(`dist doğrulandı · sürüm ${packageJson.version} · sha256 ${sha256(after)}`);
