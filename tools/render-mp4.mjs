// Frame-accurate MP4 export: renders each of the 1350 frames (45 s x 30 fps) headlessly
// and encodes 1080 x 1920 H.264 with ffmpeg. Silent (no audio track).
// Usage: node tools/render-mp4.mjs [out.mp4] [episodeSlug]
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { openEpisode, root } from './browser.mjs';

const out = process.argv[2] || join(root, 'dist/iaward-ep01.mp4');
const episode = process.argv[3];
const { browser, page, errors } = await openEpisode(episode ? `index.html?episode=${episode}` : 'index.html');
const { duration, fps } = await page.evaluate(() => ({ duration: window.__episode.duration, fps: window.__episode.fps }));
const frames = Math.round(duration * fps);

const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
  '-profile:v', 'high', '-r', String(fps), '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
  '-movflags', '+faststart', '-metadata', 'title=IAWARD - Episode 01', out,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));

for (let i = 0; i < frames; i++) {
  const b64 = await page.evaluate((t) => {
    window.__episode.renderAt(t);
    return document.getElementById('video').toDataURL('image/png').split(',')[1];
  }, i / fps);
  if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 150 === 0) console.log(`frame ${i}/${frames}`);
}
ff.stdin.end();
await done;
await browser.close();
if (errors.length) console.log('Browser messages:\n' + [...new Set(errors)].join('\n'));
console.log(`Wrote ${out} (${frames} frames, ${fps} fps)`);
