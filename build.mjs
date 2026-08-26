import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(ROOT, 'dist', 'reddit-doom-filter.user.js');

const banner = `// ==UserScript==
// @name         Reddit Karamsarlık Filtresi
// @namespace    https://github.com/umut-yalcn/reddit-filter
// @version      0.2.0
// @description  Seçili Türk subredditlerinde karamsar kariyer postlarını yerel olarak gizler.
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==`;

// Dış runtime bağımlılığı yok. Modülleri bağımlılık sırasıyla tek userscript
// kapsamına birleştiren küçük ve denetlenebilir bir build yeterli.
const modules = [
  'core/normalize.js',
  'core/journal.js',
  'core/clauses.js',
  'core/scorer.js',
  'core/content-dom.js',
  'core/filter.js',
  'userscript/main.js',
];

function stripModuleSyntax(source, name) {
  return source
    .replace(/^import\s+.*?;\s*$/gm, '')
    .replace(/^export\s+(?=(?:const|let|var|function|class)\b)/gm, '')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '')
    .replace(/^/gm, '  ')
    .replace(/^\s*$/gm, '')
    .replace(/^/, `  // ---- ${name} ----\n`);
}

const chunks = [];
for (const name of modules) {
  chunks.push(stripModuleSyntax(await readFile(join(ROOT, name), 'utf8'), name));
}

const output = `${banner}\n\n(() => {\n  'use strict';\n\n${chunks.join('\n\n')}\n})();\n`;
await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, output, 'utf8');

console.log(`dist/reddit-doom-filter.user.js oluşturuldu (${output.length} bayt)`);
