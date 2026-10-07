// Usage: node tools/snapshot.mjs [outDir] [t1 t2 ...]  - saves PNG frames for review.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openEpisode, frameAt, root } from './browser.mjs';

const out = process.argv[2] || join(root, 'dist/frames');
const times = process.argv.slice(3).map(Number);
const list = times.length ? times : [0, 2, 3.5, 5, 7.5, 10.5, 12.5, 16, 18.8, 21.8, 22.8, 25, 27.8, 29, 32, 36, 39, 42, 44.9];
mkdirSync(out, { recursive: true });
const { browser, page, errors } = await openEpisode();
for (const t of list) {
  writeFileSync(join(out, `t${t.toFixed(2).padStart(5, '0')}.png`), Buffer.from(await frameAt(page, t), 'base64'));
}
await browser.close();
if (errors.length) console.log('Browser messages:\n' + [...new Set(errors)].join('\n'));
console.log(`${list.length} frames -> ${out}`);
