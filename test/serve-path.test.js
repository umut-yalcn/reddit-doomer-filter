import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, posix, win32 } from 'node:path';
import { tmpdir } from 'node:os';
import { isPathWithinRoot, resolvePathWithinRoot } from '../scripts/path-safety.mjs';

assert.equal(isPathWithinRoot('C:\\repo', 'C:\\repo\\dist\\file.js', win32), true);
assert.equal(isPathWithinRoot('C:\\repo', 'C:\\repo-secret\\file.js', win32), false);
assert.equal(isPathWithinRoot('/repo', '/repo/dist/file.js', posix), true);
assert.equal(isPathWithinRoot('/repo', '/repo-secret/file.js', posix), false);

const base = await mkdtemp(join(tmpdir(), 'rdf-path-test-'));
const root = join(base, 'root');
const outside = join(base, 'outside');
await mkdir(root);
await mkdir(outside);
await writeFile(join(root, 'safe.js'), 'safe');
await writeFile(join(outside, 'secret.js'), 'secret');

try {
  assert.equal(await resolvePathWithinRoot(root, 'safe.js'), join(root, 'safe.js'));
  await assert.rejects(() => resolvePathWithinRoot(root, '../outside/secret.js'), /Geçersiz yol/);

  try {
    await symlink(outside, join(root, 'escape'), 'junction');
    await assert.rejects(() => resolvePathWithinRoot(root, 'escape/secret.js'), /Geçersiz gerçek yol/);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) throw error;
  }
} finally {
  await rm(base, { recursive: true, force: true });
}
