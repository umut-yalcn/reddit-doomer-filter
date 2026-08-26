import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const production = await readFile(join(ROOT, 'dist', 'reddit-doom-filter.user.js'), 'utf8');
const development = await readFile(join(ROOT, 'dist', 'reddit-doom-filter.dev.user.js'), 'utf8');

assert.match(development, /^\/\/ @name\s+Reddit Karamsarlık Filtresi DEV$/m);
assert.match(development, /^\/\/ @namespace\s+https:\/\/github\.com\/umut-yalcn\/reddit-new-filter\/dev$/m);
assert.match(development, /^\/\/ @version\s+0\.2\.0-dev$/m);
assert.doesNotMatch(development, /^\/\/ @updateURL/m);
assert.doesNotMatch(development, /^\/\/ @downloadURL/m);
assert.match(development, /rdf_personal_rules_v1/);
assert.notEqual(development, production);

console.log('DEV dist doğrulandı · ayrı ad/namespace · otomatik güncelleme kapalı');
