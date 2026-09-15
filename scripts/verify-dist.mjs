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
const stableUserscriptUrl = 'https://raw.githubusercontent.com/umut-yalcn/reddit-new-filter/stable/dist/reddit-doom-filter.user.js';
const expectedMetadata = {
  name: 'Reddit Karamsarlık Filtresi',
  namespace: repositoryUrl,
  version: packageJson.version,
  homepageURL: repositoryUrl,
  supportURL: packageJson.bugs.url,
  updateURL: stableUserscriptUrl,
  downloadURL: stableUserscriptUrl,
  sandbox: 'DOM',
};

for (const [key, expected] of Object.entries(expectedMetadata)) {
  if (metadata[key] !== expected) {
    throw new Error(`Metadata uyuşmazlığı: @${key}=${metadata[key] ?? 'yok'}, beklenen=${expected}`);
  }
}

for (const feature of [
  /shreddit-comment/,
  /Yorum filtresini kapat/,
  /Benzer yorumları daima göster/,
  /Kişisel kuralları içe aktar/,
  /Tekrar gizle/,
  /Kendi Reddit kullanıcı adını ayarla/,
  /shown-own/,
]) {
  if (!feature.test(before)) throw new Error(`Kararlı pakette birleşik özellik eksik: ${feature}`);
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
if (/GM_xmlhttpRequest|XMLHttpRequest|\bfetch\s*\(|WebSocket|EventSource|sendBeacon/.test(after)) {
  throw new Error('Kararlı paket harici ağ API yüzeyi taşımamalı.');
}
if (/^\/\/ @(?:connect|require|resource)\b/m.test(after)) {
  throw new Error('Kararlı paket uzak bağlantı veya kaynak metadata izni taşımamalı.');
}
if (/\b(?:unsafeWindow|document\.cookie)\b/.test(after)) {
  throw new Error('Kararlı paket sayfa dünyası veya çerez erişimi taşımamalı.');
}

console.log(`dist doğrulandı · sürüm ${packageJson.version} · sha256 ${sha256(after)}`);
