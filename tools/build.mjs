// Builds the deliverables for one episode from its config.
// Usage: node tools/build.mjs [episodes/ep01-iaward.config.js]
// Outputs (dist/): <slug>.srt, <slug>-narration.md, <slug>-standalone.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import vm from 'node:vm';
import { root } from './browser.mjs';

const cfgPath = process.argv[2] || 'episodes/ep01-iaward.config.js';
const read = (p) => readFileSync(join(root, p), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(read('src/series.js') + '\n' + read(cfgPath), sandbox);
const S = sandbox.window.SERIES, C = sandbox.window.EPISODE_CONFIG;
const ep = String(C.episodeNumber).padStart(2, '0');
const slug = `${C.projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-ep${ep}`;
mkdirSync(join(root, 'dist'), { recursive: true });

// SRT ------------------------------------------------------------------------------------------
const ts = (s) => {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};
const srt = C.captions.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
writeFileSync(join(root, `dist/${slug}.srt`), srt);

// Narration script -----------------------------------------------------------------------------
const words = (s) => s.split(/\s+/).filter(Boolean).length;
const total = C.narration.reduce((n, x) => n + words(x.text), 0);
const label = (id) => S.timeline.find((c) => c.id === id);
const md = [
  `# ${C.projectTitle} - Episode ${ep} of ${C.totalEpisodes}: narration script (English)`,
  '',
  `${C.company} · ${C.division} · ${C.businessContext} · 45 s · 9:16`,
  '',
  `Total: **${total} spoken words** (target 100-110). Pace: about 2.3 words per second with natural pauses.`,
  '',
  '## Voice direction',
  '- Clear, confident, warm English voice. Conversational, no hype.',
  '- Say the name as "eye-award" (one word). Do not spell out or expand it.',
  '- "ERP" is read as letters: "E-R-P".',
  '- Slight emphasis on "explicitly approves", and a beat between "AI proposes." and "Buyers approve."',
  '- 0:43-0:45 closing: no narration, music resolves.',
  '',
  '## Script by chapter',
  '',
  '| Time | Chapter | Narration | Words |',
  '|---|---|---|---|',
  ...C.narration.map((n) => {
    const c = label(n.chapter);
    const name = c.label || (c.id === 'opening' ? 'Opening' : 'Closing');
    const t = `${String(c.start).padStart(2, '0')}-${String(c.end).padStart(2, '0')} s`;
    return `| ${t} | ${name} | ${n.text || '_(no narration - hold final message)_'} | ${words(n.text)} |`;
  }),
  '',
  '## Subtitle cues (also in the .srt file)',
  '',
  '| In | Out | Text |',
  '|---|---|---|',
  ...C.captions.map((c) => `| ${c.start.toFixed(2)} | ${c.end.toFixed(2)} | ${c.text} |`),
  '',
  '## Sound design (for the editor, if audio is added)',
  '- Music: subtle, minimal electronic pulse around 100 BPM, kept at least 15 dB under the voice.',
  '- Restrained SFX only: soft whoosh on each red chapter wipe; paper slide when the request moves;',
  '  a soft click when the buyer presses Approve and a low "stamp" when approval lands. No SFX for AI proposals.',
  '- No audio is embedded in the delivered MP4 (see README).',
  '',
].join('\n');
writeFileSync(join(root, `dist/${slug}-narration.md`), md);

// Standalone HTML (everything inlined, works offline from a single file) -----------------------
let html = read('index.html');
html = html.replace(/<script>document\.write[\s\S]*?<\/script>\n/, `<script src="${cfgPath}"></script>\n`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => `<script>\n/* ${basename(src)} */\n${read(src).replace(/<\/script/gi, '<\\/script')}\n</script>`);
writeFileSync(join(root, `dist/${slug}-standalone.html`), html);

console.log(`dist/${slug}.srt\ndist/${slug}-narration.md\ndist/${slug}-standalone.html\n${total} narration words`);
