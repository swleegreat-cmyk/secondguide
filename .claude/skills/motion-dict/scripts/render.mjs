// 장면 HTML을 프레임 단위로 캡처해 MP4로 묶거나, 지정 시각의 정지 화면을 뽑는다.
//
//   node render.mjs <장면폴더>                       → <장면폴더>/out/video.mp4
//   node render.mjs <장면폴더> --stills 1.0,5.5,12   → <장면폴더>/out/still-*.png
//   옵션: --dur 20 --fps 30 --width 1920 --height 1080 --name video
//
// 장면 HTML(index.html)이 지켜야 할 약속:
//   - <canvas id="stage"> 하나에 그린다.
//   - window.__render(t): t초의 그림을 그린다. 같은 t면 항상 같은 그림(난수는 고정 시드, 현재 시각 사용 금지).
//   - window.__ready: 글꼴·이미지 로딩이 끝나면 풀리는 Promise.
//   - (선택) window.__meta = { duration, fps, width, height } — 있으면 옵션 기본값으로 쓴다.
// 필요: Node 18+, playwright(크로미움), ffmpeg
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const argv = process.argv.slice(2);
const dir = argv[0] && !argv[0].startsWith('--') ? path.resolve(argv[0]) : null;
if (!dir || !existsSync(path.join(dir, 'index.html'))) {
  console.error('사용법: node render.mjs <index.html이 있는 장면폴더> [--stills 1,2,3] [--dur 초] [--fps 30] [--width 1920] [--height 1080] [--name video]');
  process.exit(2);
}
const opt = (k) => (argv.includes('--' + k) ? argv[argv.indexOf('--' + k) + 1] : undefined);
const outDir = path.join(dir, 'out');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
let failed = false;
try {
  const probe = await browser.newPage();
  await probe.goto(pathToFileURL(path.join(dir, 'index.html')).href + '?capture=1');
  await probe.evaluate(() => window.__ready);
  const meta = (await probe.evaluate(() => window.__meta || null)) || {};
  await probe.close();
  const width = Number(opt('width') || meta.width || 1920), height = Number(opt('height') || meta.height || 1080);
  const fps = Number(opt('fps') || meta.fps || 30), dur = Number(opt('dur') || meta.duration || 0);

  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => { console.error('페이지 오류:', e.message); failed = true; });
  await page.goto(pathToFileURL(path.join(dir, 'index.html')).href + '?capture=1');
  await page.evaluate(() => window.__ready);
  const grab = async (t) => Buffer.from(await page.evaluate((t) => {
    window.__render(t);
    return document.getElementById('stage').toDataURL('image/png').split(',')[1];
  }, t), 'base64');

  const stills = opt('stills');
  if (stills) {
    for (const s of stills.split(',').map(Number)) writeFileSync(path.join(outDir, `still-${s.toFixed(2)}.png`), await grab(s));
    console.log('정지 화면 저장:', outDir);
  } else {
    if (!(dur > 0)) throw new Error('영상 길이를 알 수 없습니다. --dur 초 를 주거나 장면에 window.__meta.duration 을 넣으세요.');
    const out = path.join(outDir, (opt('name') || 'video') + '.mp4');
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', out],
      { stdio: ['pipe', 'inherit', 'inherit'] });
    const closed = new Promise((res) => ff.on('close', res));
    const total = Math.round(fps * dur);
    for (let i = 0; i < total; i++) {
      const buf = await grab(i / fps);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % 60 === 0) console.log(`프레임 ${i}/${total}`);
    }
    ff.stdin.end();
    const code = await closed;
    if (code !== 0) throw new Error('ffmpeg 실패 (종료 코드 ' + code + ')');
    console.log('영상 저장:', out);
  }
} catch (e) {
  console.error(e.message); failed = true;
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
