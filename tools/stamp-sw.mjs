import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const version = process.argv[2] || 'dev';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const assets = walk(root)
  .map((p) => relative(root, p).split('\\').join('/'))
  .filter((p) => p !== 'sw.js' && !p.startsWith('.') && !p.includes('/.') && !p.startsWith('screenshots/'))
  .sort()
  .map((p) => `./${p}`);

const swPath = join(root, 'sw.js');
let sw = readFileSync(swPath, 'utf8');
sw = sw.replace(/^const VERSION = .*$/m, `const VERSION = '${version}';`);
sw = sw.replace(/^const ASSETS = .*$/m, `const ASSETS = ${JSON.stringify(assets)};`);
writeFileSync(swPath, sw);
console.log(`sw.js: version ${version}, ${assets.length} assets`);
