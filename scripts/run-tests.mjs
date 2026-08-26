import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEST_ROOT = join(ROOT, 'test');

async function findTests(directory) {
  const tests = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) tests.push(...await findTests(path));
    else if (entry.isFile() && entry.name.endsWith('.test.js')) tests.push(path);
  }
  return tests;
}

const tests = (await findTests(TEST_ROOT)).sort();
if (tests.length === 0) throw new Error('Çalıştırılacak test bulunamadı.');

execFileSync(process.execPath, ['--test', ...tests], {
  cwd: ROOT,
  stdio: 'inherit',
});
