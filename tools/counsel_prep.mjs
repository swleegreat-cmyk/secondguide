// counsel_prep.mjs — /상담준비 <이름>
// 4구간 분포 요약 · 후보 바구니(AI 6지원안) · 생기부 보완 필요 목록 · 학급 내 지원 경합을
// 한 화면으로 정리한다. 읽기 전용, 코드 수정 없음.
// 실행: node tools/counsel_prep.mjs <이름>
import { chromium } from 'playwright';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name) { console.error('사용법: node tools/counsel_prep.mjs <이름>'); process.exit(1); }

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox']
});
const page = await browser.newPage();
await page.goto('file://' + join(TOOLS, '..', 'susi-counseling-2027.html'));
await page.waitForTimeout(1200);

const r = await page.evaluate((name) => {
  const s = STUDENTS.find(x => x.name === name);
  if (!s) return { error: `학생 '${name}' 없음. 명단: ` + STUDENTS.map(x => x.name).join(', ') };

  // 1) 4구간 분포
  const cards = buildApplicationCards(s);
  const dist = { 안정: 0, 적정: 0, 소신: 0, 상향: 0 };
  let noCut = 0;
  for (const c of cards) { if (c.noCut) noCut++; else if (dist[c.band] != null) dist[c.band]++; }

  // 2) 후보 바구니 = AI 최적 6지원안 (안정2/적정2/도전2 골격)
  const pf = calcOptimalPortfolioCards(s);
  const basket = pf.picks.map(p => ({
    slot: p.slot, univ: p.univ, dept: p.dept, jn: p.jn, jt: p.jt, band: p.band, rel: p.rel,
    g50: p.g50, g70: p.g70, minRisky: !!(p.minInfo && p.minInfo.risky), swapped: p.swapped || null,
    key: p.univ + '|' + (p.jn || p.jt) + '|' + p.dept
  }));

  // 3) 생기부 보완 필요 목록
  const a = ANALYSIS[s.seat] || {};
  const ra = analyzeRecord(s, a);
  const threads = studentTopicThreads(s, ra);
  const tg = tagStudentRecords(s);
  const n = tg.all.length || 1;
  const cliche = tg.all.filter(t => t.cliche).length;
  const low = tg.all.filter(t => t.grade === '하').length;
  const alignedCont = threads.filter(t => t.aligned && t.continuity !== '단발');
  const todo = [];
  if (!alignedCont.length) todo.push('희망 계열과 정합하는 연속(2개 학기 이상) 활동 스레드가 없음 — 진로 연계 탐구 활동 보강 필요');
  if (cliche / n > 0.15) todo.push(`상투어 문장 비율 ${Math.round(cliche / n * 100)}% (${cliche}/${n}문장) — 구체적 산출물·수치 중심으로 재기술 권장`);
  if (low / n > 0.5) todo.push(`구체성 '하' 문장 ${Math.round(low / n * 100)}% (${low}/${n}문장) — 고유명사·정량 표현 보강 필요`);
  const lowSamples = tg.all.filter(t => t.grade === '하' && !t.cliche).slice(0, 3).map(t => t.text.slice(0, 60));
  if (!todo.length) todo.push('중대 보완 항목 없음 (스레드·구체성·상투어 기준 통과)');

  // 4) 학급 내 지원 경합 — 같은 (대학·전형·학과) 카드를 6지원안에 가진 다른 학생
  const conflicts = classCardConflicts();
  const rivals = basket.map(b => ({
    card: `${b.univ} ${b.dept} (${b.jn})`,
    others: (conflicts[b.key] || []).filter(x => x.name !== name).map(x => x.name)
  })).filter(x => x.others.length);

  return {
    seat: s.seat, stAvg: cards[0] ? cards[0].stAvg : null, total: cards.length, noCut, dist,
    basket, jtMix: pf.jtMix, minRisky: pf.minRisky,
    threads: threads.slice(0, 4).map(t => ({ topic: t.topic, aligned: t.aligned, continuity: t.continuity })),
    todo, lowSamples, rivals
  };
}, name);
await browser.close();

if (r.error) { console.error(r.error); process.exit(1); }

console.log(`════════ /상담준비 ${name} (${r.seat}번) — 전과목 평균 ${r.stAvg} ════════`);
console.log(`\n■ 4구간 분포 (전체 카드 ${r.total}장, 컷 정보 없음 ${r.noCut}장 제외)`);
console.log(`  안정 ${r.dist.안정} · 적정 ${r.dist.적정} · 소신 ${r.dist.소신} · 상향 ${r.dist.상향}`);
console.log(`\n■ 후보 바구니 — AI 최적 6지원안 (교과 ${r.jtMix.교과}·종합 ${r.jtMix.종합}·논술 ${r.jtMix.논술}, 최저 리스크 ${r.minRisky}건)`);
for (const b of r.basket) {
  console.log(`  [${b.slot}|${b.band}] ${b.univ} ${b.dept} — ${b.jn} (컷50 ${b.g50 ?? '-'}/70 ${b.g70 ?? '-'} · 신뢰도 ${b.rel})${b.minRisky ? ' ⚠최저위험' : ''}${b.swapped ? ` (교체: ${b.swapped})` : ''}`);
}
console.log('\n■ 생기부 보완 필요');
r.todo.forEach(t => console.log('  - ' + t));
if (r.lowSamples.length) {
  console.log('  구체성 낮은 문장 예시:');
  r.lowSamples.forEach(t => console.log(`    · "${t}…"`));
}
console.log('\n■ 활동 스레드 (상위 4)');
r.threads.forEach(t => console.log(`  - ${t.topic} — ${t.continuity}${t.aligned ? ' · 계열 정합' : ''}`));
console.log('\n■ 학급 내 지원 경합 (6지원안 기준)');
if (!r.rivals.length) console.log('  경합 없음');
r.rivals.forEach(x => console.log(`  - ${x.card}: ${x.others.join(', ')}와 경합`));
