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
const userscriptVersion = before.match(/^\/\/ @version\s+(.+)$/m)?.[1]?.trim();

if (userscriptVersion !== packageJson.version) {
  throw new Error(`Sürüm uyuşmazlığı: package.json=${packageJson.version}, userscript=${userscriptVersion ?? 'yok'}`);
}

execFileSync(process.execPath, [join(ROOT, 'build.mjs')], {
  cwd: ROOT,
  stdio: 'pipe',
});

const after = await readFile(DIST, 'utf8');
if (before !== after) {
  throw new Error(`Build deterministik değil: ${sha256(before)} != ${sha256(after)}`);
}

console.log(`dist doğrulandı · sürüm ${packageJson.version} · sha256 ${sha256(after)}`);
