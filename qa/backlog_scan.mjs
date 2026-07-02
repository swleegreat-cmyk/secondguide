// backlog_scan.mjs — 개선 백로그 순환 점검 (1시간 루프용). 코드 수정 없음, 기록만.
// (a) 컷 정보 없음 학과 중 경쟁률·추합으로 추정 판정 가능한 후보 집계
// (b) 4구간 판정 ↔ 생기부 계열 정합 스레드 엇갈림 학생 목록
// (c) 상투어 비율이 전교 평균보다 높은 학생 목록
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SCRATCH = dirname(fileURLToPath(import.meta.url));
const MD = join(SCRATCH, 'improvement_backlog.md');
const STATE = join(SCRATCH, 'backlog_state.json');
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { idx: 0 };
const mode = ['a', 'b', 'c'][state.idx % 3];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox']
});
const page = await browser.newPage();
await page.goto('file:///home/user/secondguide/susi-counseling-2027.html');
await page.waitForTimeout(1200);

let title = '', lines = [];
if (mode === 'a') {
  title = '(a) 컷 정보 없음 학과 중 추정 판정 후보';
  const r = await page.evaluate(() => {
    let noCut = 0, withRatio = 0, withChu = 0, both = 0;
    for (const list of Object.values(DEPT_CUTLINES)) for (const e of list) {
      if (e.g50 != null || e.g70 != null) continue;
      noCut++;
      const hasRatio = e.ratio != null && !isNaN(parseFloat(e.ratio));
      const hasChu = e.cw != null;
      if (hasRatio) withRatio++;
      if (hasChu) withChu++;
      if (hasRatio && hasChu) both++;
    }
    return { noCut, withRatio, withChu, both };
  });
  lines.push(`컷 결측 레코드 ${r.noCut}건 중 경쟁률 보유 ${r.withRatio}건 · 충원배수 보유 ${r.withChu}건 · 둘 다 ${r.both}건`);
  lines.push(`→ ${r.both}건은 경쟁률+충원 기반 보조 추정(예: 동일 대학 유사 학과 컷 전이) 후보`);
} else if (mode === 'b') {
  title = '(b) 4구간 판정 ↔ 계열 정합 스레드 엇갈림';
  const r = await page.evaluate(() => {
    const out = [];
    for (const s of STUDENTS) {
      const a = ANALYSIS[s.seat] || {};
      const ra = analyzeRecord(s, a);
      const threads = studentTopicThreads(s, ra);
      const hasAligned = threads.some(t => t.aligned && t.continuity !== '단발');
      let good = 0;
      for (const ur of runAllUniversities(s).slice(0, 40)) {
        const c = calcCompositeScore(ur, s, a);
        if (c.band === '적정' || c.band === '안정') good++;
      }
      if (good >= 5 && !hasAligned) out.push(`${s.name}: 내신 적정/안정 ${good}교 있으나 계열 정합 연속 스레드 없음`);
      if (good === 0 && hasAligned) out.push(`${s.name}: 계열 정합 스레드 있으나 적정/안정권 없음 (종합전형 상향 전략 검토)`);
    }
    return out;
  });
  lines = r.length ? r : ['엇갈림 케이스 없음'];
} else {
  title = '(c) 상투어 비율 상위 학생';
  const r = await page.evaluate(() => {
    const rates = STUDENTS.map(s => {
      const tg = tagStudentRecords(s);
      const n = tg.all.length || 1;
      const c = tg.all.filter(t => t.cliche).length;
      return { name: s.name, rate: Math.round(c / n * 1000) / 10, n };
    });
    const avg = rates.reduce((a, x) => a + x.rate, 0) / rates.length;
    return { avg: Math.round(avg * 10) / 10,
             above: rates.filter(x => x.rate > avg).sort((a, b) => b.rate - a.rate).slice(0, 10) };
  });
  lines.push(`전교 평균 상투어 비율 ${r.avg}%`);
  r.above.forEach(x => lines.push(`${x.name}: ${x.rate}% (${x.n}문장)`));
}
await browser.close();

const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
let md = existsSync(MD) ? readFileSync(MD, 'utf8') : '# 개선 백로그 (자동 점검 누적 — 코드 수정 없음)\n';
md += `\n## ${now} ${title}\n`;
lines.forEach(l => md += `- ${l}\n`);
writeFileSync(MD, md);
writeFileSync(STATE, JSON.stringify({ idx: state.idx + 1 }));
console.log(`${title} — ${lines.length}줄 기록 → improvement_backlog.md`);
lines.slice(0, 5).forEach(l => console.log('  ' + l));
