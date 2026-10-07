// Shared headless-browser helper (Playwright + Chromium).
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch {}
  const globalRoot = execSync('npm root -g').toString().trim();
  return require(join(globalRoot, 'playwright'));
}

export async function openEpisode(page = 'index.html') {
  const { chromium } = loadPlaywright();
  const opts = { args: ['--force-color-profile=srgb'] };
  if (existsSync('/opt/pw-browsers/chromium') && !process.env.PLAYWRIGHT_BROWSERS_PATH) opts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(opts);
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') errors.push(m.text()); });
  await p.goto(pathToFileURL(join(root, page)).href);
  await p.evaluate(() => window.__episode.ready);
  return { browser, page: p, errors };
}

export async function frameAt(page, t) {
  return page.evaluate((t) => {
    window.__episode.renderAt(t);
    return document.getElementById('video').toDataURL('image/png').split(',')[1];
  }, t);
}
