// Cache-busting for deploys: appends ?v=<version> to the stylesheet, scripts and every ES module import,
// so browsers fetch the new files right after a deploy instead of a cached copy (GitHub Pages caches for 10 min).
// Runs in CI on the files about to be uploaded; never committed. Usage: node scripts/stamp.mjs <version>
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const v = (process.argv[2] || Date.now().toString(36)).replace(/[^\w.-]/g, '').slice(0, 12);

export const stampHtml = (html, ver) => html.replace(/(href|src)="((?:css|js)\/[\w./-]+\.(?:css|js))"/g, `$1="$2?v=${ver}"`);
export const stampJs = (js, ver) => js.replace(/(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[\w./-]+\.js)\2/g, `$1$2$3?v=${ver}$2`);

async function* jsFiles(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* jsFiles(p); else if (p.endsWith('.js')) yield p;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = path.join(site, 'index.html');
  await fs.writeFile(index, stampHtml(await fs.readFile(index, 'utf8'), v));
  let n = 0;
  for await (const f of jsFiles(path.join(site, 'js'))) { await fs.writeFile(f, stampJs(await fs.readFile(f, 'utf8'), v)); n++; }
  console.log(`Stamped index.html and ${n} scripts with v=${v}`);
}
