// Automated checks for an episode. Usage: node tools/validate.mjs
// Renders the timeline every 1/15 s in headless Chromium, records every text box the engine
// draws, and checks structure, readability, safe areas, overlaps, wording and approval gating.
// Writes dist/validation-report.md and exits non-zero on failure.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { openEpisode, frameAt, root } from './browser.mjs';

const { browser, page, errors } = await openEpisode();
const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass, detail });

const { S, C } = await page.evaluate(() => ({ S: window.SERIES, C: window.EPISODE_CONFIG }));
const step = 1 / 15;
const samples = await page.evaluate((step) => {
  const E = window.__episode.engine;
  E.audit = [];
  const out = [];
  for (let t = 0; t < 45; t += step) {
    window.__episode.renderAt(t);
    out.push({ t, boxes: E.audit.map((b) => ({ ...b })) });
  }
  E.audit = null;
  return out;
}, step);

// 1. Structure -------------------------------------------------------------------------------
const tl = S.timeline;
ok('Duration is exactly 45 s', S.duration === 45 && tl[0].start === 0 && tl.at(-1).end === 45, `${S.duration}s`);
ok('Timeline is contiguous', tl.every((c, i) => i === 0 || c.start === tl[i - 1].end));
const labels = tl.filter((c) => c.label).map((c) => c.label);
const expected = ['The project', 'The need', 'How it works', 'Value', 'What’s next'];
ok('Chapter labels and order', JSON.stringify(labels) === JSON.stringify(expected), labels.join(' > '));
ok('Opening 0-4 s and closing 43-45 s', tl[0].end === 4 && tl.at(-1).start === 43);

// order seen on screen
const seen = [];
for (const s of samples) for (const b of s.boxes) if (b.role === 'chapter' && b.alpha > 0.5 && seen.at(-1) !== b.text) seen.push(b.text);
ok('Chapter labels appear on screen in order', JSON.stringify(seen) === JSON.stringify(expected), seen.join(' > '));

// 2. Type sizes --------------------------------------------------------------------------------
const ranges = { title: [110, 150], message: [76, 100], chapter: [48, 60], subtitle: [48, 56], label: [42, 999], series: [42, 999] };
const sizeIssues = new Map();
for (const s of samples)
  for (const b of s.boxes) {
    const r = ranges[b.role];
    if (!r || b.alpha < 0.5) continue;
    if (b.size < r[0] - 0.5 || b.size > r[1] + 0.5) sizeIssues.set(`${b.role}:${b.text}`, `${b.text} (${b.role}, ${b.size.toFixed(1)}px @ ${s.t.toFixed(2)}s)`);
  }
ok('Type sizes within mobile ranges', sizeIssues.size === 0, [...sizeIssues.values()].slice(0, 12).join('; '));
const notes = new Set();
for (const s of samples) for (const b of s.boxes) if (b.role === 'note') notes.add(`${b.text} (${b.size.toFixed(0)}px)`);
ok('Footnotes below 42 px are non-essential only', [...notes].every((n) => n.startsWith('Illustrative example')), [...notes].join(', '));

// 3. Safe area -------------------------------------------------------------------------------
const safe = { x0: S.safe.left, x1: S.width - S.safe.right, y0: S.safe.top, y1: S.height - S.safe.bottom };
const out = new Map();
for (const s of samples)
  for (const b of s.boxes) {
    if (b.alpha < 0.5) continue;
    if (b.x0 < safe.x0 - 2 || b.x1 > safe.x1 + 2 || b.y0 < safe.y0 - 2 || b.y1 > safe.y1 + 2)
      if (!out.has(b.text)) out.set(b.text, `"${b.text}" @ ${s.t.toFixed(2)}s [${b.x0.toFixed(0)},${b.y0.toFixed(0)} - ${b.x1.toFixed(0)},${b.y1.toFixed(0)}]`);
  }
ok('All text inside the safe area', out.size === 0, [...out.values()].slice(0, 10).join('; '));

// 4. Overlapping text -----------------------------------------------------------------------
const overlaps = new Map();
for (const s of samples) {
  const bs = s.boxes.filter((b) => b.alpha >= 0.5);
  for (let i = 0; i < bs.length; i++)
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j];
      if (a.text === b.text && Math.abs(a.x0 - b.x0) < 1) continue;
      const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ix > 3 && iy > 3) {
        const key = [a.text, b.text].sort().join(' | ');
        if (!overlaps.has(key)) overlaps.set(key, `"${a.text}" x "${b.text}" @ ${s.t.toFixed(2)}s`);
      }
    }
}
ok('No overlapping text', overlaps.size === 0, [...overlaps.values()].slice(0, 10).join('; '));

// 5. Subtitles, messages and visual band ----------------------------------------------------
let maxSub = 0, maxMsg = 0, subAboveVisual = true, visualIntoSubs = [];
for (const s of samples) {
  const subs = s.boxes.filter((b) => b.role === 'subtitle' && b.alpha > 0.3);
  maxSub = Math.max(maxSub, subs.length);
  const msgs = s.boxes.filter((b) => b.role === 'message' && b.alpha > 0.3);
  maxMsg = Math.max(maxMsg, msgs.length);
  if (subs.length) {
    const top = Math.min(...subs.map((b) => b.y0));
    if (top < S.layout.visualBottom) subAboveVisual = false;
    for (const b of s.boxes) if (b.role === 'label' && b.alpha > 0.3 && b.y1 > top - 40) visualIntoSubs.push(`${b.text} @ ${s.t.toFixed(2)}s`);
  }
}
ok('Subtitles: max two lines', maxSub <= 2, `max ${maxSub} lines`);
ok('Main message: one at a time, max two lines', maxMsg <= 2, `max ${maxMsg} lines`);
ok('Subtitles stay in the lower zone, below the main visual', subAboveVisual && visualIntoSubs.length === 0, [...new Set(visualIntoSubs)].slice(0, 5).join('; '));

const caps = C.captions;
const capIssues = [];
caps.forEach((c, i) => {
  if (i && c.start < caps[i - 1].end) capIssues.push(`overlap at ${c.start}`);
  if (c.end - c.start < 1.4) capIssues.push(`"${c.text}" shown < 1.4 s`);
  const cps = c.text.length / (c.end - c.start);
  if (cps > 25) capIssues.push(`"${c.text}" ${cps.toFixed(1)} chars/s`);
  const ch = tl.find((x) => c.start >= x.start && c.start < x.end);
  if (c.end > ch.end + 1e-6) capIssues.push(`"${c.text}" crosses the ${ch.id} chapter cut`);
});
ok('Captions: ordered, readable pace, inside their chapter', capIssues.length === 0, capIssues.join('; '));
ok('No subtitles during closing hold', !caps.some((c) => c.end > 43));

const msgIssues = [];
for (const [key, id] of [['projectDescription', 'project'], ['need', 'need'], ['workflow', 'how'], ['value', 'value'], ['nextSteps', 'next']]) {
  const ch = tl.find((x) => x.id === id);
  for (const m of C[key].messages) {
    if (m.start < ch.start || m.end > ch.end) msgIssues.push(`"${m.text}" outside ${id}`);
    if (m.text.split(/\s+/).length > 7) msgIssues.push(`"${m.text}" > 7 words`);
    if (m.end - m.start < 2.5) msgIssues.push(`"${m.text}" visible < 2.5 s`);
  }
}
ok('Main messages: 3-7 words, inside chapter, >= 2.5 s on screen', msgIssues.length === 0, msgIssues.join('; '));

const words = C.narration.map((n) => n.text).join(' ').split(/\s+/).filter(Boolean).length;
ok('Narration length ~100-110 words', words >= 95 && words <= 115, `${words} words`);
const capText = caps.map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim();
const narText = C.narration.map((n) => n.text).join(' ').replace(/\s+/g, ' ').trim();
ok('Subtitles match narration word-for-word', capText === narText);

// 6. Language and claims --------------------------------------------------------------------
const visible = new Set();
for (const s of samples) for (const b of s.boxes) visible.add(b.text);
const allText = [...visible, ...caps.map((c) => c.text), ...C.narration.map((n) => n.text)].join(' \n ');
const spanish = /\b(de|del|la|las|el|los|y|que|para|con|por|compra|compras|proveedor(es)?|oferta(s)?|pedido|solicitud|aprobado|negociaci[oó]n|adjudicaci[oó]n|siguiente|valor|necesidad|proyecto)\b|[ñáéíóú¿¡]/i;
ok('English only (no Spanish words or characters)', !spanish.test(allText), (allText.match(spanish) || [''])[0]);
const claims = /(\d+\s?%|[€$£]\s?\d|\b\d+x\b|\bsav(e|es|ing|ings)\b|\bfaster\b|\bROI\b|\bSAP\b|\blive\b|\blaunch(ed)?\b|\bin production\b|\bmillion|\bthousand)/i;
ok('No invented metrics or live-integration claims', !claims.test(allText), (allText.match(claims) || [''])[0]);
ok('"IAWARD" never expanded', !/I\.?A\.?\s*W\.?A\.?R\.?D\.?\s*\(|IAWARD\s*\(|stands for/i.test(allText));
ok('Destination named "Corporate ERP"', visible.has('Corporate ERP') && visible.has('Business management system'));
ok('Future work labelled as planned', [...visible].some((x) => /Planned/.test(x)) && visible.has('Future refinement'));

// 7. Human approval gating -------------------------------------------------------------------
const cps = C.workflow.visual.steps.filter((s) => s.checkpoint);
const decisions = cps.map((s) => s.checkpoint.decision);
ok('Checkpoints for supplier selection, negotiation and award', ['Supplier selection', 'Negotiation', 'Award'].every((d) => decisions.includes(d)), decisions.join(', '));
const gate = [];
for (const s of cps) {
  const c = s.checkpoint;
  if (!(s.start < c.pauseAt && c.pauseAt < c.approveAt && c.approveAt < s.end)) gate.push(`${c.decision}: timing`);
  if (c.approveAt - c.pauseAt < 0.8) gate.push(`${c.decision}: pause too short to read`);
  const texts = (tt) => page.evaluate((tt) => { const E = window.__episode.engine; E.audit = []; window.__episode.renderAt(tt); const r = E.audit.map((b) => b.text); E.audit = null; return r; }, tt);
  // every sampled frame of the checkpoint before the buyer acts must show no approval
  for (let tt = c.pauseAt - 0.3; tt < c.approveAt; tt += 1 / 30) {
    if ((await texts(tt)).some((x) => /^Approved/.test(x))) { gate.push(`${c.decision}: "Approved" visible at ${tt.toFixed(2)}s`); break; }
  }
  const before = await texts(c.approveAt - 0.05);
  const after = await page.evaluate((tt) => { const E = window.__episode.engine; E.audit = []; window.__episode.renderAt(tt); const r = E.audit.map((b) => b.text); E.audit = null; return r; }, c.approveAt + 0.5);
  if (before.some((x) => /^Approved/.test(x))) gate.push(`${c.decision}: "Approved" visible before the buyer acts`);
  if (!before.includes('Approve') || !before.includes('Awaiting buyer')) gate.push(`${c.decision}: no visible Approve action / waiting state`);
  if (!after.includes('Approved by buyer')) gate.push(`${c.decision}: approval not attributed to buyer`);
}
ok('Each decision waits for an explicit buyer approval', gate.length === 0, gate.join('; '));

// 8. Determinism (seeking) -------------------------------------------------------------------
const h = (b64) => createHash('sha1').update(b64).digest('hex');
const a1 = h(await frameAt(page, 22.0));
await frameAt(page, 41.3);
await frameAt(page, 3.1);
const a2 = h(await frameAt(page, 22.0));
ok('Seeking is deterministic (same frame after jumping around)', a1 === a2);
const r0 = h(await frameAt(page, 0));
ok('Restart renders the first frame identically', r0 === h(await frameAt(page, 0)));

ok('No browser errors or layout warnings', errors.length === 0, [...new Set(errors)].join('; '));
await browser.close();

// report -------------------------------------------------------------------------------------
const passed = results.filter((r) => r.pass).length;
const md = [
  `# Validation report - Episode ${String(C.episodeNumber).padStart(2, '0')}: ${C.projectTitle}`,
  '',
  `Generated by \`node tools/validate.mjs\` - ${passed}/${results.length} checks passed.`,
  `Sampled ${samples.length} frames (every ${step.toFixed(3)} s) at 1080 x 1920.`,
  '',
  '| Check | Result | Detail |',
  '|---|---|---|',
  ...results.map((r) => `| ${r.name} | ${r.pass ? 'PASS' : '**FAIL**'} | ${(r.detail || '').replace(/\|/g, '/')} |`),
  '',
].join('\n');
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/validation-report.md'), md);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  - ' + r.detail : ''}`);
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
