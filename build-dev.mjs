import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(ROOT, 'dist', 'reddit-doom-filter.user.js');
const outputPath = join(ROOT, 'dist', 'reddit-doom-filter.dev.user.js');
const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));

const source = await readFile(sourcePath, 'utf8');
const output = source
  .replace('// @name         Reddit Karamsarlık Filtresi', '// @name         Reddit Karamsarlık Filtresi DEV')
  .replace(
    `// @namespace    ${packageJson.homepage}`,
    `// @namespace    ${packageJson.homepage}/dev`,
  )
  .replace(`// @version      ${packageJson.version}`, `// @version      ${packageJson.version}-dev`)
  .replace(
    '// @description  Seçili Türk subredditlerinde karamsar kariyer postlarını yerel olarak gizler.',
    '// @description  Kişisel göster/gizle kuralları için izole geliştirme sürümü.',
  )
  .replace(/^\/\/ @updateURL.*\r?\n/gm, '')
  .replace(/^\/\/ @downloadURL.*\r?\n/gm, '');

if (output === source) throw new Error('DEV metadata dönüşümü uygulanamadı.');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, 'utf8');
console.log(`dist/reddit-doom-filter.dev.user.js oluşturuldu (${output.length} bayt)`);
