// Usage: node tools/render.mjs stills 1,5.5,9   -> out/still_*.png
//        node tools/render.mjs video [workers]  -> out/video_noaudio.mp4 + out/cues.json
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const url = 'file://' + path.join(root, 'index.html');
const out = path.join(root, 'out'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files', '--font-render-hinting=none'] });
async function newPage() {
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', e => console.error('PAGEERR', e.message));
  await p.goto(url); await p.evaluate(() => window.__ready);
  return p;
}
const [mode, arg] = process.argv.slice(2);
if (mode === 'stills') {
  const p = await newPage();
  for (const t of arg.split(',').map(Number)) {
    await p.evaluate(t => render(t), t);
    await p.locator('#stage').screenshot({ path: path.join(out, `still_${String(t).padStart(5, '0')}.png`) });
  }
} else {
  const W = +(arg || 4);
  const p0 = await newPage();
  const { fps, dur, cues } = await p0.evaluate(() => ({ fps: FPS, dur: DURATION, cues: CUES }));
  fs.writeFileSync(path.join(out, 'cues.json'), JSON.stringify(cues, null, 1));
  const N = Math.round(fps * dur), per = Math.ceil(N / W);
  await Promise.all([...Array(W)].map(async (_, w) => {
    const p = w === 0 ? p0 : await newPage();
    const a = w * per, b = Math.min(N, a + per);
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', path.join(out, `part_${w}.mp4`)]);
    for (let f = a; f < b; f++) {
      await p.evaluate(t => render(t), f / fps);
      const buf = await p.screenshot({ type: 'jpeg', quality: 96, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (f % 150 === 0) console.log(`w${w} frame ${f}/${b}`);
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
  }));
  fs.writeFileSync(path.join(out, 'parts.txt'), [...Array(W)].map((_, w) => `file 'part_${w}.mp4'`).join('\n'));
  await new Promise(r => spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(out, 'parts.txt'), '-c', 'copy', path.join(out, 'video_noaudio.mp4')], { stdio: 'inherit' }).on('close', r));
}
await browser.close();
