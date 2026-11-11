// 사용법:
//   node render.mjs                     → out/d8-suneung.mp4 (30fps, 20초)
//   node render.mjs --stills 1.0,5.5    → out/still-*.png (지정 시각만 캡처)
// 필요: Node 18+, playwright(크로미움), ffmpeg
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');
mkdirSync(outDir, { recursive: true });
const FPS = 30, DUR = 20;
const args = process.argv.slice(2);
const stillsArg = args.includes('--stills') ? args[args.indexOf('--stills') + 1] : null;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
await page.goto(pathToFileURL(path.join(here, 'index.html')).href + '?capture=1');
await page.evaluate(() => window.__ready);

async function grab(t) {
  const b64 = await page.evaluate(t => { window.__render(t); return document.getElementById('stage').toDataURL('image/png').split(',')[1]; }, t);
  return Buffer.from(b64, 'base64');
}

if (stillsArg) {
  const { writeFileSync } = await import('node:fs');
  for (const s of stillsArg.split(',').map(Number)) {
    writeFileSync(path.join(outDir, `still-${s.toFixed(2)}.png`), await grab(s));
  }
  console.log('stills written to', outDir);
} else {
  const out = path.join(outDir, 'd8-suneung.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = FPS * DUR;
  for (let i = 0; i < total; i++) {
    const buf = await grab(i / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 60 === 0) console.log(`frame ${i}/${total}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('video written to', out);
}
await browser.close();
