// verify.mjs — 수능 최저학력기준 충족 판정(checkMinRequirement) 검증
// 실행: node verify.mjs  →  전부 [PASS] 시 exit code 0
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox']
});
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
await page.goto('file:///home/user/secondguide/susi-counseling-2027.html');
await page.waitForTimeout(1500);

// 브라우저 컨텍스트에서 checkMinRequirement 실행 (명시적 수능 등급으로 결정론적 검증)
async function check(suneung, minText, dept) {
  return page.evaluate(({ suneung, minText, dept }) => {
    const r = checkMinRequirement({ suneung }, minText, dept);
    return { meets: r.meets, required: r.required, applicable: r.applicable,
             used: (r.usedAreas || []).map(a => `${a.area}${a.grade}`),
             sumHave: r.sumHave, shortfall: (r.shortfall || []).map(s => s.type + ':' + s.detail) };
  }, { suneung, minText, dept });
}

const results = [];
function assert(name, cond, info) {
  results.push({ name, pass: !!cond, info });
}

// ── 충족(PASS) 케이스 2개 ──
// 1) 2개 등급 합 6: 국2·수2 = 합4 ≤ 6 → 충족
{
  const r = await check({ 국어: 2, 수학: 2, 영어: 3, 탐구: 3 }, '2개 등급 합 6');
  assert('충족#1: 국2·수2 (합4) ≤ 2개합6', r.meets === true && r.sumHave === 4, JSON.stringify(r));
}
// 2) 3개 등급 합 5, 한국사 4등급: 국1·수2·영2 = 합5 ≤ 5 & 한국사3 ≤ 4 → 충족
{
  const r = await check({ 국어: 1, 수학: 2, 영어: 2, 탐구: 3, 한국사: 3 }, '3개 등급 합 5, 한국사 4등급');
  assert('충족#2: 상위3합5 & 한국사3 (기준 3개합5,한국사4)', r.meets === true && r.sumHave === 5, JSON.stringify(r));
}

// ── 미충족(FAIL) 케이스 2개 ──
// 3) 2개 등급 합 6: 국4·영4 = 합8 > 6 → 미충족 (합 초과)
{
  const r = await check({ 국어: 4, 수학: 5, 영어: 4, 탐구: 5 }, '2개 등급 합 6');
  const overShort = r.shortfall.some(s => s.startsWith('sum-over'));
  assert('미충족#1: 상위2합8 > 2개합6 (sum-over)', r.meets === false && overShort, JSON.stringify(r));
}
// 4) 3개 등급 합 5, 한국사 4등급: 합은 통과(1+1+2=4)하나 한국사5 > 4 → 미충족 (한국사 부족)
{
  const r = await check({ 국어: 1, 수학: 1, 영어: 2, 탐구: 2, 한국사: 5 }, '3개 등급 합 5, 한국사 4등급');
  const khShort = r.shortfall.some(s => s.startsWith('korean-history'));
  assert('미충족#2: 합은통과·한국사5>4 (korean-history)', r.meets === false && khShort, JSON.stringify(r));
}

// ── 부가 케이스: 최저 없음 / 1개 영역 ──
{
  const r = await check({ 국어: 5, 수학: 6 }, '미적용');
  assert('부가#1: 미적용 → applicable=false·meets=true', r.applicable === false && r.meets === true, JSON.stringify(r));
}
{
  // 1개 영역 3등급 이내: 국3 ≤ 3 → 충족
  const r = await check({ 국어: 3, 수학: 5, 영어: 4 }, '1개 영역 3등급 이내');
  assert('부가#2: 국3 ≤ 1개영역3등급 → 충족', r.meets === true, JSON.stringify(r));
}

// ═══════════════════════════════════════════════
// 학과별 합격선 추이 (calcCutlineTrend) 검증
// ═══════════════════════════════════════════════
async function trend(series) {
  return page.evaluate((series) => {
    const t = calcCutlineTrend(series);
    return { insufficient: t.insufficient, direction: t.direction, volatility: t.volatility,
             slope: t.slope, stdev: t.stdev, cls: t.cls, points: t.points };
  }, series);
}

// 추이#1: 안정적·유지 (거의 변화 없음)
{
  const t = await trend([{ year: 2024, cut: 2.10 }, { year: 2025, cut: 2.12 }, { year: 2026, cut: 2.08 }]);
  assert('추이#1: 안정적·유지 (σ≤0.15, |slope|<0.15)',
    t.volatility === '안정적' && t.direction === '유지', JSON.stringify(t));
}
// 추이#2: 입결 상승세 (컷 등급 지속 하락 = 경쟁 심화)
{
  const t = await trend([{ year: 2024, cut: 4.00 }, { year: 2025, cut: 3.50 }, { year: 2026, cut: 3.00 }]);
  assert('추이#2: 입결 상승세 (slope≤-0.15)',
    t.direction === '입결 상승세' && t.slope <= -0.15, JSON.stringify(t));
}
// 추이#3: 변동 큼 (큰 진폭)
{
  const t = await trend([{ year: 2024, cut: 2.00 }, { year: 2025, cut: 4.50 }, { year: 2026, cut: 2.30 }]);
  assert('추이#3: 변동 큼 (σ>0.40)',
    t.volatility === '변동 큼', JSON.stringify(t));
}
// 추이#4: 입결 하락세 (컷 등급 상승 = 완화)
{
  const t = await trend([{ year: 2025, cut: 3.00 }, { year: 2026, cut: 4.20 }]);
  assert('추이#4: 입결 하락세 (slope≥+0.15)',
    t.direction === '입결 하락세' && t.slope >= 0.15, JSON.stringify(t));
}
// 추이#5: 데이터 부족 (1개년 → insufficient)
{
  const t = await trend([{ year: 2026, cut: 3.00 }]);
  assert('추이#5: 1개년 → insufficient=true',
    t.insufficient === true, JSON.stringify(t));
}

// ═══════════════════════════════════════════════
// 백테스트 정확도 교차검증 (backtest.py 기준값)
// ═══════════════════════════════════════════════
// backtest.py 기록값: AI-0 기준(재보정 전) → 재보정 후 최적 정확도
const AI0_BASELINE_ACCURACY = 92.7;   // 재보정 전 (offset 0)
const BASELINE_ACCURACY = 100.0;      // 재보정 후 (COMPOSITE_WEIGHTS 적용) — backtest.py 기록값
const BASELINE_ERROR_RATE = 33.0;     // 재보정 후 오차율

// 브라우저의 실제 cutCurveProb + ADM_RESULTS로 동일 백테스트 재현
const bt = await page.evaluate(() => {
  const OFFSETS = [-1.0, -0.5, -0.2, 0.0, 0.3, 0.5, 1.0];
  const normJt = s => { s = String(s || ''); return s.includes('논술') ? '논술' : s.includes('종합') ? '종합' : '교과'; };
  let total = 0, correct = 0, errSum = 0;
  for (const [univ, data] of Object.entries(ADM_RESULTS)) {
    for (const gyeol of ['인문', '자연', '전체']) {
      for (const e of (data[gyeol] || [])) {
        const cuts = [];
        if (e.cut != null && e.cut >= 0.5 && e.cut <= 9) cuts.push([+e.cut, normJt(e.jt)]);
        if (e.cut2 != null && e.cut2 >= 0.5 && e.cut2 <= 9) cuts.push([+e.cut2, normJt(e.jt)]);
        for (const [cut, jt] of cuts) {
          for (const off of OFFSETS) {
            const diff = off;
            const actual = off <= 1e-9 ? 1 : 0;
            const prob = Math.max(3, Math.min(97, cutCurveProb(diff, jt === '종합', jt === '논술')));
            const pred = prob >= 50 ? 1 : 0;
            total++;
            if (pred === actual) correct++;
            errSum += Math.abs(prob / 100 - actual);
          }
        }
      }
    }
  }
  return { total, accuracy: Math.round(correct / total * 1000) / 10, errorRate: Math.round(errSum / total * 1000) / 10 };
});

// COMPOSITE_WEIGHTS(재보정 가중치)가 실제로 baked 되어 있는지
const weightsBaked = await page.evaluate(() =>
  typeof COMPOSITE_WEIGHTS === 'object' && COMPOSITE_WEIGHTS && COMPOSITE_WEIGHTS['종합'] &&
  typeof COMPOSITE_WEIGHTS['종합'].offset === 'number');

assert(`백테스트#0: COMPOSITE_WEIGHTS 상수 baked 확인`, weightsBaked === true, 'weights not baked');
assert(`백테스트#1: verify 재현 정확도 ${bt.accuracy}% == 재보정 기준 ${BASELINE_ACCURACY}%`,
  Math.abs(bt.accuracy - BASELINE_ACCURACY) < 0.15, JSON.stringify(bt));
assert(`백테스트#2: 오차율 ${bt.errorRate}% == 기준 ${BASELINE_ERROR_RATE}%`,
  Math.abs(bt.errorRate - BASELINE_ERROR_RATE) < 0.15, JSON.stringify(bt));
assert(`백테스트#3: 재보정 후(${bt.accuracy}%) ≥ AI-0 기준(${AI0_BASELINE_ACCURACY}%) — 개선/동등`,
  bt.accuracy >= AI0_BASELINE_ACCURACY - 1e-9, JSON.stringify(bt));

// ═══════════════════════════════════════════════
// 신뢰도 등급 계산 검증 (표본 수 기반)
// ═══════════════════════════════════════════════
// 앱에 baked된 UNIV_CONFIDENCE로 등급 규칙(≥10 높음, 3~9 보통, ≤2 낮음) 검증
const confData = await page.evaluate(() => {
  const rule = n => (n >= 10 ? '높음' : n >= 3 ? '보통' : '낮음');
  // 실제 baked 데이터 중 각 등급 샘플 추출 + 규칙 일치 검사
  let allMatch = true, high = 0, mid = 0, low = 0;
  for (const [u, c] of Object.entries(UNIV_CONFIDENCE)) {
    if (rule(c.samples) !== c.grade) allMatch = false;
    if (c.grade === '높음') high++; else if (c.grade === '보통') mid++; else low++;
  }
  // 경계값 직접 검증
  return { allMatch, high, mid, low,
    b10: rule(10), b9: rule(9), b3: rule(3), b2: rule(2), b0: rule(0) };
});
assert('신뢰도#1: 경계값 규칙 (10→높음, 9→보통, 2→낮음)',
  confData.b10 === '높음' && confData.b9 === '보통' && confData.b2 === '낮음', JSON.stringify(confData));
assert('신뢰도#2: 경계값 규칙 (3→보통, 0→낮음)',
  confData.b3 === '보통' && confData.b0 === '낮음', JSON.stringify(confData));
assert('신뢰도#3: baked UNIV_CONFIDENCE 전체가 등급규칙과 일치',
  confData.allMatch === true, JSON.stringify(confData));

// ═══════════════════════════════════════════════
// 요인별 기여도 breakdown 합 = 100% 검증
// ═══════════════════════════════════════════════
const fbData = await page.evaluate(() => {
  const out = [];
  // 실제 학생×대학 조합에서 factorBreakdown 합 확인
  for (const si of [0, 3, 10, 20, 33]) {
    const s = STUDENTS[si]; const a = ANALYSIS[s.seat] || {};
    const results = runAllUniversities(s);
    for (const r of results.slice(0, 6)) {
      const comp = calcCompositeScore(r, s, a);
      const sum = comp.factorBreakdown.reduce((acc, f) => acc + f.pct, 0);
      out.push({ name: s.name, univ: r.univ, sum, n: comp.factorBreakdown.length });
    }
  }
  // 합성 케이스: buildFactorBreakdown 직접 호출
  const synth1 = buildFactorBreakdown({ 내신: 50, 생기부매칭: 10, 성적추세: 5, 경쟁률: -3, 학급위치: 2 });
  const synth2 = buildFactorBreakdown({ 내신: 0, 생기부매칭: 0, 성적추세: 0 }); // 전부 0 → 내신 100
  return {
    allSum100: out.every(o => o.sum === 100),
    count: out.length,
    synth1Sum: synth1.reduce((s, f) => s + f.pct, 0),
    synth2Sum: synth2.reduce((s, f) => s + f.pct, 0),
    synth2Naesin: (synth1.find(f => f.key === '내신') || {}).pct
  };
});
assert(`breakdown#1: 실제 ${fbData.count}개 조합 모두 기여도 합=100%`,
  fbData.allSum100 === true, JSON.stringify(fbData));
assert('breakdown#2: 합성 케이스 기여도 합=100% (일반/전부0 모두)',
  fbData.synth1Sum === 100 && fbData.synth2Sum === 100, JSON.stringify(fbData));

// ═══════════════════════════════════════════════
// 골든 케이스 검산 (golden_cases.json ↔ computeScore)
// 기대환산점수가 null이 아닌 케이스만 오차 0.01 이내 비교.
// null인 케이스는 "검산 대기"로 집계 — 모집요강 수동 검산 후 값을 채우면 자동 검증된다.
// ═══════════════════════════════════════════════
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const GOLDEN_PATH = join(dirname(fileURLToPath(import.meta.url)), 'golden_cases.json');
const goldenCases = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
let goldenPending = 0, goldenChecked = 0;
for (const gc of goldenCases) {
  if (gc.기대환산점수 == null) { goldenPending++; continue; }
  goldenChecked++;
  const got = await page.evaluate(({ univ, subjects }) => {
    const rule = NAESIN_RULES[univ];
    if (!rule) return { error: 'NAESIN_RULES에 없음' };
    const r = computeScore(subjects, rule, { A: 1, B: 3, C: 5 });
    return { score: r.환산등급, reliability: r.reliability };
  }, { univ: gc.대학명, subjects: gc.입력성적 });
  const ok = !got.error && got.score != null && Math.abs(got.score - gc.기대환산점수) <= 0.01;
  assert(`골든#${goldenChecked}: ${gc.대학명} 기대 ${gc.기대환산점수} ↔ 엔진 ${got.score?.toFixed?.(3) ?? got.error ?? 'null'} (오차≤0.01)`,
    ok, JSON.stringify(got));
}
// 골든 케이스 무결성: 25건 + 필수 필드 존재
assert(`골든#무결성: 25건·필수필드(대학명/전형명/입력성적/검산근거) 완비`,
  goldenCases.length === 25 && goldenCases.every(c =>
    c.대학명 && c.전형명 && Array.isArray(c.입력성적) && c.입력성적.length > 0 &&
    typeof c.검산근거 === 'string' && c.검산근거.length > 0 && '기대환산점수' in c),
  `count=${goldenCases.length}`);

// ── 결과 출력 ──
console.log('══════════════════════════════════════════════');
console.log('  verify.mjs — 최저기준+추이+백테스트+신뢰도+기여도+골든케이스 검증');
console.log('══════════════════════════════════════════════');
console.log(`골든 케이스: 총 ${goldenCases.length}건 · 검산 완료 ${goldenChecked}건 · 검산 대기 ${goldenPending}건`);
if (goldenPending > 0) console.log(`  → 검산 대기 ${goldenPending}건: 모집요강과 수동 대조 후 golden_cases.json의 기대환산점수를 채우면 자동 검증됩니다`);
console.log(`신뢰도 분포: 높음 ${confData.high} · 보통 ${confData.mid} · 낮음 ${confData.low} (대학 기준)`);
console.log(`정확도: AI-0 기준 ${AI0_BASELINE_ACCURACY}% → 재보정 후 ${BASELINE_ACCURACY}% (verify 재현 ${bt.accuracy}%) · 오차율 ${bt.errorRate}%`);
console.log('──────────────────────────────────────────────');
let failCount = 0;
for (const r of results) {
  const tag = r.pass ? '[PASS]' : '[FAIL]';
  if (!r.pass) failCount++;
  console.log(`${tag} ${r.name}`);
  if (!r.pass) console.log(`        → ${r.info}`);
}
if (pageErrors.length) {
  failCount += pageErrors.length;
  console.log(`[FAIL] JS 런타임 오류 ${pageErrors.length}건`);
  pageErrors.forEach(e => console.log('        → ' + e));
}
console.log('──────────────────────────────────────────────');
console.log(`총 ${results.length}건 · 통과 ${results.length - results.filter(r => !r.pass).length} · 실패 ${failCount}`);

await browser.close();

if (failCount === 0) {
  console.log('✅ ALL PASS — exit code 0');
  process.exit(0);
} else {
  console.log('❌ FAILURES DETECTED — exit code 1');
  process.exit(1);
}
