import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(ROOT, 'dist', 'reddit-doom-filter.user.js');
const outputPath = join(ROOT, 'dist', 'reddit-doom-filter.comments-dev.user.js');
const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const repositoryUrl = String(packageJson.homepage).replace(/\/$/, '');
const developmentVersion = '0.4.0-hardened-dev';
const source = await readFile(sourcePath, 'utf8');
const output = source
  .replace('// @name         Reddit Karamsarlık Filtresi', '// @name         Reddit Karamsarlık Filtresi Yorum DEV')
  .replace(`// @namespace    ${repositoryUrl}`, `// @namespace    ${repositoryUrl}/comments-dev`)
  .replace(`// @version      ${packageJson.version}`, `// @version      ${developmentVersion}`)
  .replace(
    '// @description  Seçili Türk subredditlerinde karamsar kariyer postlarını ve yorumlarını yerel olarak gizler.',
    '// @description  Post, yorum ve kişisel kurallar için birleşik geliştirme sürümü.',
  )
  .replace(/^\/\/ @updateURL.*\r?\n/gm, '')
  .replace(/^\/\/ @downloadURL.*\r?\n/gm, '');

if (output === source) throw new Error('Yorum DEV metadata dönüşümü uygulanamadı.');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, 'utf8');
console.log(`dist/reddit-doom-filter.comments-dev.user.js oluşturuldu (${output.length} bayt)`);
