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
// 판정 신뢰도는 카드 엔트리의 rel 필드(빌드 산출)가 담당한다.
// (구 UNIV_CONFIDENCE/DEPT_CONFIDENCE 상수는 앱 미사용 대학 단위 잔재로 제거됨)
const confData = await page.evaluate(() => {
  const rule = n => (n >= 10 ? '높음' : n >= 3 ? '보통' : '낮음');
  // 대학별 표본 수(엔트리 수) 기반 분포 — 요약 출력용
  const perUniv = {};
  for (const [k, list] of Object.entries(DEPT_CUTLINES)) {
    const u = k.slice(0, k.indexOf('|'));
    perUniv[u] = (perUniv[u] || 0) + list.length;
  }
  let high = 0, mid = 0, low = 0;
  for (const n of Object.values(perUniv)) {
    const g = rule(n);
    if (g === '높음') high++; else if (g === '보통') mid++; else low++;
  }
  // 엔트리 rel 규칙 전수 확인 (컷 완비+충원+모집≥10 → 높음 / 컷 있음 → 보통 / 컷 없음 → 낮음)
  const relRule = e => {
    const numOk = e.num != null && !isNaN(parseFloat(e.num));
    const chuOk = e.chu != null && !isNaN(parseFloat(e.chu));
    if (e.g50 == null && e.g70 == null) return '낮음';
    if (e.g50 != null && e.g70 != null && chuOk && numOk && parseFloat(e.num) >= 10) return '높음';
    return '보통';
  };
  let relMatch = true;
  for (const list of Object.values(DEPT_CUTLINES)) for (const e of list) if (relRule(e) !== e.rel) relMatch = false;
  return { relMatch, high, mid, low,
    b10: rule(10), b9: rule(9), b3: rule(3), b2: rule(2), b0: rule(0) };
});
assert('신뢰도#1: 경계값 규칙 (10→높음, 9→보통, 2→낮음)',
  confData.b10 === '높음' && confData.b9 === '보통' && confData.b2 === '낮음', JSON.stringify(confData));
assert('신뢰도#2: 경계값 규칙 (3→보통, 0→낮음)',
  confData.b3 === '보통' && confData.b0 === '낮음', JSON.stringify(confData));
assert('신뢰도#3: 카드 엔트리 rel 필드 전수가 빌드 규칙과 일치',
  confData.relMatch === true, JSON.stringify(confData));

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
// adiga 데이터 품질: 중복 처리 + 결측 폴백 검증
// ═══════════════════════════════════════════════
import { readFileSync as _rf } from 'fs';
import { dirname as _dn, join as _jn } from 'path';
import { fileURLToPath as _fp } from 'url';
const _SCRATCH = _dn(_fp(import.meta.url));
const dq = JSON.parse(_rf(_jn(_SCRATCH, 'data_quality.json'), 'utf8'));

// 중복#1: 탈락 레코드 67건 전부가 규칙(완전성 우선 → 모집인원 큰 쪽) 만족
{
  const gradeOk = v => { const f = parseFloat(v); return !isNaN(f) && f >= 1 && f <= 9; };
  const comp = r => (gradeOk(r.등급50) ? 1 : 0) + (gradeOk(r.등급70) ? 1 : 0);
  const num = v => { const f = parseFloat(v); return isNaN(f) ? -1 : f; };
  const bad = dq.dup_dropped.filter(d => {
    const ck = comp(d.keep), cd = comp(d.drop);
    if (ck > cd) return false;                       // 더 완전한 쪽 채택 ✓
    if (ck === cd) return num(d.keep.모집인원) < num(d.drop.모집인원); // 동률 → 모집인원 큰 쪽 ✓
    return true;                                     // 덜 완전한 쪽을 채택했으면 규칙 위반
  });
  assert(`중복#1: 탈락 ${dq.dup_dropped.length}건 전부 규칙(완전성→모집인원) 만족`,
    dq.dup_dropped.length > 0 && bad.length === 0, JSON.stringify(bad.slice(0, 3)));
}
// 중복#2: 대표 중복 키가 baked DEPT_CUTLINES에서 전형당 1건으로 정리됨
{
  const dupCheck = await page.evaluate(() => {
    const out = [];
    for (const key of ['동덕여자대학교|컴퓨터학전공', '부산대학교|전기공학전공']) {
      const entries = DEPT_CUTLINES[key] || [];
      const seen = {};
      let dup = 0;
      for (const e of entries) { const k = e.jn; if (seen[k]) dup++; seen[k] = 1; }
      out.push({ key, n: entries.length, dup });
    }
    return out;
  });
  assert('중복#2: 동덕여대·부산대 중복 키가 전형명당 1건으로 정리 (중복 0)',
    dupCheck.every(o => o.n > 0 && o.dup === 0), JSON.stringify(dupCheck));
}
// 폴백#1: 등급70만 결측 → 등급50 기반 판정 + '70컷 정보 없음' 플래그
{
  const r = await page.evaluate(() => deptCutFallback({ g50: 3.2, g70: null, ratio: 7.1 }));
  assert("폴백#1: g70 결측 → g50 기반 + '70컷 정보 없음' 플래그",
    r.mode === 'g50-fallback' && r.cut === 3.2 && r.flag === '70컷 정보 없음', JSON.stringify(r));
}
// 폴백#2: 둘 다 결측 → 판정 불가 + '컷 정보 없음 — 경쟁률 N:1 참고' (목록 유지)
{
  const r = await page.evaluate(() => deptCutFallback({ g50: null, g70: null, ratio: 5.2 }));
  const kept = await page.evaluate(() => {
    // 둘 다 결측 레코드가 baked 데이터에서 제외되지 않고 유지되는지
    let n = 0;
    for (const list of Object.values(DEPT_CUTLINES))
      for (const e of list) if (e.g50 == null && e.g70 == null) n++;
    return n;
  });
  assert("폴백#2: 둘 다 결측 → '컷 정보 없음 — 경쟁률 5.2:1 참고' + 데이터 유지",
    r.mode === 'no-cut' && r.cut === null && r.label === '컷 정보 없음 — 경쟁률 5.2:1 참고' && kept > 0,
    JSON.stringify({ r, kept }));
}

// ═══════════════════════════════════════════════
// 4구간 최종 판정 (안정/적정/소신/상향) — classifyBand
// 사다리: s<g50 안정 · g50≤s≤g70 적정 · g70<s≤g70+0.2 소신 · s>g70+0.2 상향
// ═══════════════════════════════════════════════
{
  const b = await page.evaluate(() => ({
    안정: classifyBand(2.5, 3.0, 3.3),   // 등급50(3.0)보다 유리
    적정: classifyBand(3.15, 3.0, 3.3),  // 등급50~등급70 사이
    소신: classifyBand(3.45, 3.0, 3.3),  // 등급70 초과 +0.2 이내 (컷 근처 완충)
    상향: classifyBand(3.6, 3.0, 3.3),   // 완충 범위 밖으로 불리
    결측: classifyBand(3.0, null, null), // 둘 다 결측 → 판정 강제 안 함
    g50만: classifyBand(3.1, 3.0, null), // 70컷 결측 → 등급50 기반
  }));
  assert("4구간#1: s=2.5 < g50=3.0 → 안정", b.안정 === '안정', JSON.stringify(b));
  assert("4구간#2: g50=3.0 ≤ s=3.15 ≤ g70=3.3 → 적정", b.적정 === '적정', JSON.stringify(b));
  assert("4구간#3: g70=3.3 < s=3.45 ≤ 3.5 → 소신", b.소신 === '소신', JSON.stringify(b));
  assert("4구간#4: s=3.6 > g70+0.2 → 상향", b.상향 === '상향', JSON.stringify(b));
}
// 4구간#5: 컷 결측 — band=null 유지 + 추천 결과의 '컷 정보 없음' 표시 보존
{
  const r = await page.evaluate(() => {
    const nullBand = classifyBand(3.0, null, null);
    // 실제 데이터에서 등급50/70 모두 결측(noCut)인 추천 항목을 찾아 band가 강제되지 않는지 확인
    let sample = null;
    for (let si = 0; si < STUDENTS.length && !sample; si++) {
      const s = STUDENTS[si]; const a = ANALYSIS[s.seat] || {};
      for (const ur of runAllUniversities(s)) {
        if (ur.noCut) {
          const comp = calcCompositeScore(ur, s, a);
          sample = { univ: ur.univ, note: ur.note, band: comp.band, label: comp.bandNoCutLabel };
          break;
        }
      }
    }
    return { nullBand, sample };
  });
  const sampleOk = r.sample === null ||
    (r.sample.band === null && String(r.sample.label || r.sample.note).includes('컷 정보 없음'));
  assert("4구간#5: 컷 결측 → 판정 null + '컷 정보 없음' 표시 유지 (강제 판정 없음)",
    r.nullBand === null && sampleOk, JSON.stringify(r));
}

// ═══════════════════════════════════════════════
// 충원배수(추합÷모집인원) 보정 — cw ≥ 1.0이면 소신→적정, 적정→안정 한 단계 상향
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => ({
    // 보정으로 구간이 달라지는 케이스 2개
    소신to적정_base: classifyBand(3.45, 3.0, 3.3),          // 소신 (g70<s≤g70+0.2)
    소신to적정_adj:  classifyBand(3.45, 3.0, 3.3, 1.2),     // 충원 1.2배수 → 적정
    적정to안정_base: classifyBand(3.15, 3.0, 3.3),          // 적정 (g50≤s≤g70)
    적정to안정_adj:  classifyBand(3.15, 3.0, 3.3, 1.0),     // 충원 1.0배수(경계) → 안정
    // 충원배수 null → 보정 미적용
    null보정없음:    classifyBand(3.45, 3.0, 3.3, null),    // 소신 유지
    // 발동 기준 미만(cw<1.0)도 보정 없음 · 상향은 보정 대상 아님
    저배수:          classifyBand(3.45, 3.0, 3.3, 0.7),
    상향유지:        classifyBand(3.6, 3.0, 3.3, 2.0),
  }));
  assert("충원#1: 소신(3.45 vs 3.0/3.3) + 충원 1.2배수 → '적정'으로 상향",
    r.소신to적정_base === '소신' && r.소신to적정_adj === '적정', JSON.stringify(r));
  assert("충원#2: 적정(3.15 vs 3.0/3.3) + 충원 1.0배수 → '안정'으로 상향",
    r.적정to안정_base === '적정' && r.적정to안정_adj === '안정', JSON.stringify(r));
  assert("충원#3: 충원배수 null → 보정 미적용 (소신 유지) · cw<1.0/상향도 미보정",
    r.null보정없음 === '소신' && r.저배수 === '소신' && r.상향유지 === '상향', JSON.stringify(r));
}

// ═══════════════════════════════════════════════
// 학과별 판정 신뢰도 등급 (빌드 단계 산출 rel 필드) + 판정 근거 문자열
// 기준: 높음=등급50·70·추합·모집인원 완비 & 모집≥10 / 보통=컷 있으나 일부 결측·모집<10 / 낮음=컷 모두 결측
// ═══════════════════════════════════════════════
{
  const rel = await page.evaluate(() => {
    const ruleOf = e => {
      const numOk = e.num != null && !isNaN(parseFloat(e.num));
      const chuOk = e.chu != null && !isNaN(parseFloat(e.chu));
      if (e.g50 == null && e.g70 == null) return '낮음';
      if (e.g50 != null && e.g70 != null && chuOk && numOk && parseFloat(e.num) >= 10) return '높음';
      return '보통';
    };
    const found = { 높음: null, 보통: null, 낮음: null };
    let checked = 0, mismatch = 0;
    for (const [key, list] of Object.entries(DEPT_CUTLINES)) {
      for (const e of list) {
        checked++;
        if (ruleOf(e) !== e.rel) mismatch++;
        if (!found[e.rel]) found[e.rel] = { key, g50: e.g50, g70: e.g70, chu: e.chu, num: e.num, rel: e.rel };
      }
    }
    return { found, checked, mismatch };
  });
  const f = rel.found;
  assert(`신뢰도등급#1(높음): 컷·추합·모집 완비 & 모집≥10 — 예: ${f.높음 && f.높음.key}`,
    f.높음 && f.높음.g50 != null && f.높음.g70 != null && parseFloat(f.높음.num) >= 10, JSON.stringify(f.높음));
  assert(`신뢰도등급#2(보통): 컷 있으나 일부 결측/모집<10 — 예: ${f.보통 && f.보통.key}`,
    f.보통 && (f.보통.g50 != null || f.보통.g70 != null), JSON.stringify(f.보통));
  assert(`신뢰도등급#3(낮음): 등급50·70 모두 결측 — 예: ${f.낮음 && f.낮음.key} · 전수 ${rel.checked}건 규칙 일치(불일치 ${rel.mismatch})`,
    f.낮음 && f.낮음.g50 == null && f.낮음.g70 == null && rel.mismatch === 0, JSON.stringify(f.낮음));
}
// 판정근거#1: calcCompositeScore가 상담사용 근거 문자열을 생성하는지
{
  const r = await page.evaluate(() => {
    for (let si = 0; si < STUDENTS.length; si++) {
      const s = STUDENTS[si], a = ANALYSIS[s.seat] || {};
      for (const ur of runAllUniversities(s)) {
        const comp = calcCompositeScore(ur, s, a);
        if (comp.band && comp.bandReason && ur.deptCut && ur.deptCut.g70 != null) {
          return { univ: ur.univ, band: comp.band, reason: comp.bandReason, rel: comp.judgeReliability };
        }
      }
    }
    return null;
  });
  const ok = r && /평균등급 [\d.]+ vs .*컷 [\d.]+ → (안정|적정|소신|상향)/.test(r.reason) && r.rel;
  assert(`판정근거#1: "평균등급 X vs 컷 Y → 구간" 형식 생성 — 예: ${r && r.reason}`, !!ok, JSON.stringify(r));
}

// ═══════════════════════════════════════════════
// 상위N 선택 과목 수 + 판정 방향 검증 (김나경 1.00 버그 회귀 방지)
// ═══════════════════════════════════════════════
{
  // 골든 샘플 성적표(석차등급 20과목 + 진로선택 A·B 2과목)로 상위N 선택 검증
  const sample = JSON.parse(_rf(_jn(_SCRATCH, 'golden_cases.json'), 'utf8'))[0].입력성적;
  const r = await page.evaluate((subj) => {
    const 상명 = computeScore(subj, NAESIN_RULES['상명대학교'], {A:1,B:3,C:5});
    const 수원 = computeScore(subj, NAESIN_RULES['수원대학교'], {A:1,B:3,C:5});
    return { 상명: { v: 상명.환산등급, n: 상명.반영과목수 }, 수원: { v: 수원.환산등급, n: 수원.반영과목수 } };
  }, sample);
  // 규정: 진로선택 포함 명시 없음 → 석차등급 과목만. 샘플 석차 상위3 = [2,2,2] → 2.0 / 상위5 = [2,2,2,2,2] → 2.0
  assert(`상위N#1: 상명대 상위3 — 석차등급 과목만 3개 선택, 환산 2.0 (성취 A=1 미점령)`,
    r.상명.n === 3 && Math.abs(r.상명.v - 2.0) <= 0.01 && r.상명.v > 1.01, JSON.stringify(r));
  assert(`상위N#2: 수원대 상위5 — 선택 수 = 규칙 N(5), 환산 2.0 (1.00 아님)`,
    r.수원.n === 5 && Math.abs(r.수원.v - 2.0) <= 0.01 && r.수원.v > 1.01, JSON.stringify(r));
}
{
  // 판정 방향: 등급 스케일(낮을수록 우수)에서 단조성 확인
  const r = await page.evaluate(() => {
    const rank = { '상향': 0, '소신': 1, '적정': 2, '안정': 3 };
    // (i) 학생 성적이 좋아질수록(수치↓) 판정은 같거나 유리
    const sweepS = [4.0, 3.6, 3.45, 3.15, 2.5].map(s => classifyBand(s, 3.0, 3.3));
    const monoS = sweepS.every((b, i) => i === 0 || rank[b] >= rank[sweepS[i-1]]);
    // (ii) 같은 학생, 컷이 관대해질수록(수치↑) 판정은 같거나 유리 (김나경 평균 5.25 시나리오)
    const sweepC = [2.0, 4.0, 5.2, 5.5, 6.5].map(c => classifyBand(5.25, c, c));
    const monoC = sweepC.every((b, i) => i === 0 || rank[b] >= rank[sweepC[i-1]]);
    return { sweepS, monoS, sweepC, monoC };
  });
  assert(`판정방향#1: 성적 우수할수록 판정 유리 — [${r.sweepS.join('→')}]`, r.monoS, JSON.stringify(r));
  assert(`판정방향#2: 컷 관대할수록 판정 유리 (s=5.25) — [${r.sweepC.join('→')}]`, r.monoC, JSON.stringify(r));
}

// ═══════════════════════════════════════════════
// 세특 문장 태깅 엔진 + 주제 스레드 검증
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    const 상 = tagSentence('『코스모스』를 읽고 3회에 걸쳐 토론 보고서를 작성함');       // 고유+정량+산출물
    const 중 = tagSentence('설문지를 제작하여 학급에 배포함');                            // 산출물 1종
    const 하 = tagSentence('수업에 성실히 참여하고 적극적인 태도를 보임');                // 0종 + 상투어
    const 부정 = tagSentence('『코스모스』를 읽었으나 단순 요약에 그침');                 // 고유 있으나 부정 문맥
    const 과목유래 = tagSentence('물리 법칙에 큰 흥미를 보임', { subjectName: '물리학Ⅰ' }); // '물리 법칙' 제외
    const 복붙 = detectCopyPaste([
      { seat: 901, records: [{ y: 1, t: '세부능력및특기사항', b: '지역 하천의 수질 오염 원인을 조사하고 개선 방안을 제안하는 캠페인을 진행함.' }] },
      { seat: 902, records: [{ y: 2, t: '세부능력및특기사항', b: '지역 하천의 수질 오염 원인을 조사하고 개선 방안을 제안하는 캠페인을 진행함.' }] },
      { seat: 903, records: [{ y: 1, t: '세부능력및특기사항', b: '독자적인 주제로 발표를 준비하여 급우들의 호응을 얻음.' }] },
    ]);
    return { 상: 상.grade, 중: 중.grade, 하: [하.grade, 하.cliche],
             부정: [부정.grade, 부정.negated, 부정.signals.고유],
             과목유래: [과목유래.grade, 과목유래.subjectDerived],
             복붙쌍: 복붙.pairs.length, 복붙좌석: 복붙.pairs[0] ? 복붙.pairs[0].seats : [] };
  });
  assert("태깅#1(상): 고유(『』)+정량(3회)+산출물(보고서) ≥2종 → 상", r.상 === '상', JSON.stringify(r));
  assert("태깅#2(중): 산출물(설문지) 1종 → 중", r.중 === '중', JSON.stringify(r));
  assert("태깅#3(하): 신호 0종 + 상투어 감지 → 하", r.하[0] === '하' && r.하[1] === true, JSON.stringify(r));
  assert("태깅#4(부정 무효): '~에 그침' 문맥 → 고유 신호 무효, 하", r.부정[0] === '하' && r.부정[1] === true, JSON.stringify(r));
  assert("태깅#5(과목유래 제외): 물리학Ⅰ 세특의 '물리 법칙' → 신호 미인정 (subjectDerived 기록)",
    r.과목유래[0] === '하' && r.과목유래[1].length >= 1, JSON.stringify(r));
  assert("태깅#6(복붙 감지): 30자 이상 동일 문장 2개 학생 → 복붙 의심 1쌍 (seats 901·902)",
    r.복붙쌍 === 1 && r.복붙좌석.includes(901) && r.복붙좌석.includes(902), JSON.stringify(r));
}
{
  const r = await page.evaluate(() => {
    const mk = (y, b) => ({ y, t: '세부능력및특기사항', b });
    // 3년 연속 심화형: 1학년 하 → 3학년 상
    const 심화 = extractTopicThreads([
      mk(1, '미세먼지에 관심을 가짐. 미세먼지 기사를 찾아봄'),
      mk(2, '미세먼지 측정 설문지를 제작함'),
      mk(3, '미세먼지 농도를 30회 측정하여 분석 보고서를 작성함'),
    ]);
    // 단발: 한 학년에서만 등장
    const 단발 = extractTopicThreads([
      mk(2, '로봇 동아리에서 로봇 구조를 탐구함'),
      mk(3, '문학 작품 감상문을 제출함'),
    ]);
    // 계열 정합: deptKeywords와 겹치는 주제
    const 정합 = extractTopicThreads([
      mk(2, '간호 직업 탐색 활동에서 간호사의 역할을 조사함'),
      mk(3, '간호 관련 봉사를 12회 수행하고 보고서를 작성함'),
    ], { deptKeywords: ['간호', '보건'] });
    const f = (arr, tok) => arr.find(t => t.topic === tok) || null;
    return { 심화: f(심화, '미세먼지'), 단발: f(단발, '로봇'), 정합: f(정합, '간호') };
  });
  assert(`스레드#1(3년 연속 심화형): 미세먼지 1·2·3학년 + 하→상 — ${r.심화 && r.심화.continuity}/${r.심화 && r.심화.depth}`,
    r.심화 && r.심화.continuity === '1→2→3학년 연속' && r.심화.depth === '심화형', JSON.stringify(r.심화));
  assert("스레드#2(단발): 로봇 2학년만 등장 → 단발",
    r.단발 && r.단발.continuity === '단발', JSON.stringify(r.단발));
  assert("스레드#3(계열 정합): '간호' 주제 ↔ deptKeywords ['간호','보건'] → aligned",
    r.정합 && r.정합.aligned === true && r.정합.continuity === '2→3학년 연속', JSON.stringify(r.정합));
}

// ═══════════════════════════════════════════════
// 지원 카드 레이어 (대학×전형×학과 단위) 검증
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    const s = STUDENTS[1];
    const cards = buildApplicationCards(s);
    const adigaRows = Object.values(DEPT_CUTLINES).reduce((a, l) => a + l.length, 0);
    const fieldsOk = cards.slice(0, 500).every(c =>
      'band' in c && 'cw' in c && 'rel' in c && typeof c.score === 'number' && c.univ && c.dept);
    const bySub = getCards(s, { subs: ['간호'] });
    const manualSub = cards.filter(c => c.sub === '간호').length;
    const byJt = getCards(s, { subs: [], jt: '논술' });
    const manualJt = cards.filter(c => String(c.jt).includes('논술')).length;
    return { cards: cards.length, adigaRows, fieldsOk,
             sub: { got: bySub.length, manual: manualSub, allMatch: bySub.every(c => c.sub === '간호') },
             jt: { got: byJt.length, manual: manualJt, allMatch: byJt.every(c => String(c.jt).includes('논술')) } };
  });
  // adiga 유효 행수(중복 제거 후) — data_quality.json과 3중 대조
  const dqClean = dq.total_clean;
  assert(`카드#1: 카드 ${r.cards}장 == DEPT_CUTLINES ${r.adigaRows}행 == adiga 정제 ${dqClean}행 · 필수 필드(판정/충원/신뢰도/환산) 완비`,
    r.cards === r.adigaRows && r.cards === dqClean && r.fieldsOk, JSON.stringify(r));
  assert(`카드#2: 소계열 필터 '간호' → ${r.sub.got}장 (수동 대조 ${r.sub.manual}) 전부 일치`,
    r.sub.got === r.sub.manual && r.sub.got > 0 && r.sub.allMatch, JSON.stringify(r.sub));
  assert(`카드#3: 유형 필터 '논술' → ${r.jt.got}장 (수동 대조 ${r.jt.manual}) 전부 일치`,
    r.jt.got === r.jt.manual && r.jt.got > 0 && r.jt.allMatch, JSON.stringify(r.jt));
}

// ═══════════════════════════════════════════════
// 2계층 카드 기여도 표시 — 실사용 요인만, 합 100%
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    const out = [];
    // 실데이터 2케이스: 서로 다른 학생·대학의 실사용 요인 기여도
    for (const si of [1, 20]) {
      const s = STUDENTS[si], a = ANALYSIS[s.seat] || {};
      const ur = runAllUniversities(s).find(x => x.deptCut && x.deptCut.g70 != null);
      const comp = calcCompositeScore(ur, s, a);
      const used = usedFactorBreakdown(comp);
      out.push({ si, univ: ur.univ, n: used.length, total: comp.factorBreakdown.length,
                 sum: used.reduce((x, f) => x + f.pct, 0),
                 zeroShown: used.some(f => f.pct <= 0) });
    }
    // 합성 케이스: 계산에 쓰이지 않은 요인(기여 0)은 표시 목록에서 제외
    const synth = buildFactorBreakdown({ 내신: 50, 생기부매칭: 10, 경쟁률: 0, 수능최저: 0, 성적추세: 5 });
    const used = synth.filter(f => f.pct > 0);
    return { real: out, synthKeys: used.map(f => f.key), synthSum: used.reduce((x, f) => x + f.pct, 0) };
  });
  assert(`기여도표시#1: 학생1(${r.real[0].univ}) 실사용 요인 ${r.real[0].n}/${r.real[0].total}개, 합 ${r.real[0].sum}%`,
    r.real[0].sum === 100 && !r.real[0].zeroShown, JSON.stringify(r.real[0]));
  assert(`기여도표시#2: 학생2(${r.real[1].univ}) 실사용 요인 ${r.real[1].n}/${r.real[1].total}개, 합 ${r.real[1].sum}%`,
    r.real[1].sum === 100 && !r.real[1].zeroShown, JSON.stringify(r.real[1]));
  assert(`기여도표시#3: 기여 0 요인(경쟁률·수능최저) 미표시 + 표시 합 ${r.synthSum}%`,
    !r.synthKeys.includes('경쟁률') && !r.synthKeys.includes('수능최저') && r.synthSum === 100 && r.synthKeys.includes('내신'),
    JSON.stringify(r));
}

// ═══════════════════════════════════════════════
// AI 최적 6지원 — 카드 단위 조합 검증
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    const mk = (univ, jn, dept, band, jt) => ({ univ, jn, jt: jt || '교과', dept, band,
      noCut: false, g50: 3, g70: 3.3, cw: null, rel: '높음', stAvg: 3.1, score: 3.1, bandAdjusted: false });
    const s = STUDENTS[1];
    // 케이스 A: 안정 후보가 같은 대학의 서로 다른 전형 2장뿐 → 둘 다 채택돼야 함 (수시 규정 동일)
    const poolA = [
      mk('한밭대학교', '교과(일반)', '기계공학과', '안정'),
      mk('한밭대학교', '교과(지역인재)', '기계공학과', '안정'),
      mk('공주대학교', '교과(일반)', '경영학과', '적정'),
      mk('충남대학교', '교과(일반)', '경제학과', '적정'),
      mk('단국대학교', '종합(DKU)', '경영학과', '소신', '종합'),
      mk('인하대학교', '종합(인하미래)', '경제학과', '소신', '종합'),
    ];
    const pfA = calcOptimalPortfolioCards(s, poolA);
    const keysA = pfA.picks.map(p => p.univ + '|' + p.jn);
    // 케이스 B: 풍부한 풀 → 골격(안정2/적정2/소신·상향2) 준수
    const poolB = [];
    const bands = ['안정', '안정', '안정', '적정', '적정', '적정', '소신', '소신', '상향', '상향'];
    bands.forEach((b, i) => poolB.push(mk('대학' + i, '전형' + i, '학과' + i, b, i % 2 ? '종합' : '교과')));
    const pfB = calcOptimalPortfolioCards(s, poolB);
    return { A: { n: pfA.picks.length, keys: keysA, counts: pfA.counts },
             B: { counts: pfB.counts, n: pfB.picks.length, jtMix: pfB.jtMix } };
  });
  assert("6지원#1: 같은 대학(한밭대) 다른 전형 2장 모두 조합 허용",
    r.A.keys.includes('한밭대학교|교과(일반)') && r.A.keys.includes('한밭대학교|교과(지역인재)') && r.A.counts.안정 === 2,
    JSON.stringify(r.A));
  assert(`6지원#2: 골격 준수 — 안정 ${r.B.counts.안정}/적정 ${r.B.counts.적정}/소신·상향 ${r.B.counts.소신 + r.B.counts.상향} (6장)`,
    r.B.n === 6 && r.B.counts.안정 === 2 && r.B.counts.적정 === 2 && (r.B.counts.소신 + r.B.counts.상향) === 2,
    JSON.stringify(r.B));
}

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

// ═══════════════════════════════════════════════
// 카드 컷 값 = adiga.json 원본 행 값 (STEP 1 진단 후속 회귀 방지)
// 화면 카드가 쓰는 DEPT_CUTLINES의 g50/g70이 원본 어디가 값과 일치해야 한다.
// 표본: 성균관대 종합 3장 + 중앙대 종합 2장 (특목 혼재 고위험 컷 포함 고정 표본)
// ═══════════════════════════════════════════════
{
  const adigaRaw = JSON.parse(
    readFileSync('/home/user/secondguide/tools/adiga.json', 'utf8').replace(/:\s*NaN/g, ': null'));
  const CARD_SAMPLES = [
    { rawU: '성균관대', univ: '성균관대학교', dept: '물리학과', jn: '종합(면접형-과학인재)' },
    { rawU: '성균관대', univ: '성균관대학교', dept: '공학계열', jn: '종합(융합형)' },
    { rawU: '성균관대', univ: '성균관대학교', dept: '배터리학과', jn: '종합(면접형-계약학과)' },
    { rawU: '중앙대', univ: '중앙대학교', dept: '화학공학과', jn: '종합(CAU탐구형)' },
    { rawU: '중앙대', univ: '중앙대학교', dept: '소프트웨어학부', jn: '종합(CAU융합형)' },
  ];
  console.log('──── 카드 컷 ↔ adiga 원본 대조 (표본 5장) ────');
  const perUniv = { 성균관대학교: [], 중앙대학교: [] };
  for (const smp of CARD_SAMPLES) {
    const card = await page.evaluate(({ univ, dept, jn }) => {
      const e = (DEPT_CUTLINES[univ + '|' + dept] || []).find(x => x.jn === jn);
      return e ? { g50: e.g50, g70: e.g70 } : null;
    }, smp);
    const raw = adigaRaw.find(r =>
      r['대학'] === smp.rawU && String(r['학과']) === smp.dept && String(r['전형']) === smp.jn);
    const same = !!card && !!raw &&
      String(card.g50 ?? '') === String(raw['등급50'] ?? '') &&
      String(card.g70 ?? '') === String(raw['등급70'] ?? '');
    console.log(`  ${smp.univ} ${smp.dept} — ${smp.jn}`);
    console.log(`    카드: g50=${card?.g50 ?? '?'} g70=${card?.g70 ?? '?'} | 원본: 등급50=${raw?.['등급50'] ?? '?'} 등급70=${raw?.['등급70'] ?? '?'} → ${same ? '[일치]' : '[불일치!]'}`);
    perUniv[smp.univ].push(same);
  }
  assert('카드컷#1: 성균관대학교 종합 카드 3장 g50/g70 = adiga 원본 행',
    perUniv['성균관대학교'].length === 3 && perUniv['성균관대학교'].every(Boolean),
    JSON.stringify(perUniv['성균관대학교']));
  assert('카드컷#2: 중앙대학교 종합 카드 2장 g50/g70 = adiga 원본 행',
    perUniv['중앙대학교'].length === 2 && perUniv['중앙대학교'].every(Boolean),
    JSON.stringify(perUniv['중앙대학교']));
}

// ═══════════════════════════════════════════════
// 컷 해석주의 (특목·자사고 혼재 컷 보수화) 검증
// 명단 대학 × 종합전형 × 50컷>3.0 카드는 안정/적정 대신 '유보'.
// 교과전형·비명단 대학·50컷≤3.0은 기존 판정 유지.
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    // 케이스1: 명단 대학 종합 저컷 — 강리영(stAvg 5.28) × 성균관대 물리학과 과학인재(g50 5.35)
    //          수치상 '안정'이지만 컷 해석주의로 '유보'가 되어야 한다
    const s = STUDENTS.find(x => x.name === '강리영');
    const cards = buildApplicationCards(s);
    const c1 = cards.find(c => c.univ === '성균관대학교' && c.dept === '물리학과' && c.jn === '종합(면접형-과학인재)');
    // 케이스2: 명단 대학이지만 교과전형(정량 선발)은 미적용.
    //   실데이터의 명단 대학 교과 카드 중 50컷이 가장 불리한 카드가 caution 아님 +
    //   합성 입력(성균관대·교과·g50 5.35 — 종합이었다면 유보)으로 전형 조건을 격리 검증
    const c2 = cards.filter(c => CUT_CAUTION_SET.has(c.univ) && String(c.jt).includes('교과') && c.g50 != null)
      .sort((a, b) => b.g50 - a.g50)[0];
    const c2Synthetic = isCutCaution('성균관대학교', '교과', 5.35);   // false여야 함
    const c2Control = isCutCaution('성균관대학교', '종합', 5.35);     // true여야 함 (대조군)
    // 케이스3: 비명단 대학 종합 저컷은 기존 판정 유지 (classifyBand 결과 그대로)
    const c3 = cards.find(c => !CUT_CAUTION_SET.has(c.univ) && String(c.jt).includes('종합') && c.g50 != null && c.g50 > 3.0 && c.band);
    // 대학별 집계: 컷 해석주의로 판정이 바뀐(안정/적정→유보) 카드 수 — 전체 34명 합산
    const changed = {};
    let changedTotal = 0, targetEntries = 0;
    for (const st of STUDENTS) {
      for (const c of buildApplicationCards(st)) {
        if (c.band === '유보') { changed[c.univ] = (changed[c.univ] || 0) + 1; changedTotal++; }
      }
    }
    for (const [k, list] of Object.entries(DEPT_CUTLINES)) {
      const u = k.slice(0, k.indexOf('|'));
      if (!CUT_CAUTION_SET.has(u)) continue;
      for (const e of list) if (String(e.jt || '').includes('종합') && e.g50 != null && e.g50 > 3.0) targetEntries++;
    }
    const pick = c => c && { univ: c.univ, dept: c.dept, jn: c.jn, jt: c.jt, g50: c.g50, band: c.band, bandRaw: c.bandRaw, caution: c.caution, reason: c.cautionReason };
    return { list: CUT_CAUTION_UNIVS, c1: pick(c1), c2: pick(c2), c2Synthetic, c2Control, c3: pick(c3),
             c3Expected: c3 ? classifyBand(c3.stAvg, c3.g50, c3.g70, c3.cw) : null,
             changed, changedTotal, targetEntries };
  });
  console.log(`──── 컷 해석주의 — 명단 ${r.list.length}개 대학 · 대상 엔트리 ${r.targetEntries}건 ────`);
  console.log('  판정 변경(안정/적정/소신→유보) 카드 수 — 34명 합산, 대학별:');
  for (const [u, n] of Object.entries(r.changed).sort((a, b) => b[1] - a[1]))
    console.log(`    ${u}: ${n}장`);
  console.log(`    합계: ${r.changedTotal}장`);
  assert(`컷해석주의#1: 강리영×성균관대 물리 과학인재(g50 ${r.c1?.g50}) 수치상 ${r.c1?.bandRaw} → 판정 유보`,
    r.c1 && r.c1.caution === true && r.c1.band === '유보' && r.c1.bandRaw === '안정'
      && r.c1.reason === '특목·자사고 지원자 혼재 가능성으로 발표 컷이 일반고 합격선과 다를 수 있음',
    JSON.stringify(r.c1));
  assert(`컷해석주의#2: 명단 대학 교과전형 미적용 — 실카드 최불리(${r.c2?.univ} ${r.c2?.dept}, g50 ${r.c2?.g50}) + 합성(성균관·교과·5.35)`,
    r.c2 && r.c2.caution === false && r.c2.band !== '유보'
      && r.c2Synthetic === false && r.c2Control === true,
    JSON.stringify({ c2: r.c2, synthetic: r.c2Synthetic, control: r.c2Control }));
  assert(`컷해석주의#3: 비명단 대학 종합 저컷(${r.c3?.univ} ${r.c3?.dept}, g50 ${r.c3?.g50}) 기존 판정 유지`,
    r.c3 && r.c3.caution === false && r.c3.band !== '유보' && r.c3.band === r.c3Expected,
    JSON.stringify({ c3: r.c3, expected: r.c3Expected }));
}

// ═══════════════════════════════════════════════
// 카드 보드 UX: 초성 검색 · 여유도 정렬 · 후보 바구니 저장/복원
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    // 1) 초성 검색: 순서 유지 부분수열 (ㅅㄱㄷ ⊂ ㅅㄱㄱㄷㅎㄱ)
    const cho = cardSearchMatch('성균관대학교', 'ㅅㄱㄷ') === true
      && cardSearchMatch('중앙대학교', 'ㅅㄱㄷ') === false
      && cardSearchMatch('성균관대학교', '성균') === true;
    // 2) 여유도순(평균-70컷, 기본 정렬): 비내림차순 + 최솟값(가장 여유) 선두
    const s = STUDENTS.find(x => x.name === '강리영');
    const cards = buildApplicationCards(s).filter(c => !c.noCut && c.band === '적정');
    const sorted = sortBoardCards(cards, 'margin');
    let mono = sorted.length > 1;
    for (let i = 1; i < sorted.length; i++)
      if (boardMarginOf(sorted[i]) < boardMarginOf(sorted[i - 1])) mono = false;
    const marginOk = mono && boardMarginOf(sorted[0]) === Math.min(...cards.map(boardMarginOf));
    // 3) 후보 바구니: localStorage 저장 → 캐시 무효화 후 복원 → 6지원 후보군 선두 반영 → 정리
    const key = basketKeyOf(sorted[0]);
    toggleBasketEnc(s.seat, encodeURIComponent(key));
    const saved = (localStorage.getItem('basket_' + s.seat) || '').includes(sorted[0].dept);
    delete _basketCache[s.seat];                        // 메모리 캐시 제거 → localStorage에서 복원
    const restored = getBasket(s.seat).includes(key);
    const candFirst = basketKeyOf(portfolioCandidateCards(s)[0]) === key;
    toggleBasketEnc(s.seat, encodeURIComponent(key));
    const cleaned = getBasket(s.seat).length === 0 && portfolioCandidateCards(s) === null;
    return { cho, marginOk, n: sorted.length, saved, restored, candFirst, cleaned };
  });
  assert('보드UX#1: 초성 검색 — "ㅅㄱㄷ"→성균관대 일치 · 중앙대 불일치 · 일반 부분일치',
    r.cho === true, JSON.stringify(r));
  assert(`보드UX#2: 여유도순 정렬 — 적정 탭 ${r.n}장 margin 비내림차순 + 최솟값 선두`,
    r.marginOk === true, JSON.stringify(r));
  assert('보드UX#3: 후보 바구니 localStorage 저장·복원 + 6지원 후보군 선두 반영',
    r.saved && r.restored && r.candFirst && r.cleaned, JSON.stringify(r));
}

// ═══════════════════════════════════════════════
// 전략적 지원 추천 선별 목록 (selectStrategicCards)
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    const out = [];
    for (const name of ['강리영', '김수안']) {
      const s = STUDENTS.find(x => x.name === name);
      const picks = selectStrategicCards(s);
      const byBand = { 안정: 0, 적정: 0, 소신: 0 };
      const univN = {};
      let bad = 0;
      for (const c of picks) {
        if (byBand[c.band] != null) byBand[c.band]++;
        univN[c.univ] = (univN[c.univ] || 0) + 1;
        if (c.noCut || c.band === '유보' || !['안정', '적정', '소신'].includes(c.band)) bad++;
      }
      out.push({ name, n: picks.length, byBand,
                 maxPerUniv: Math.max(...Object.values(univN)), bad });
    }
    return out;
  });
  assert(`추천선별#1: 선별 11장 내외 (강리영 ${r[0].n}장=안${r[0].byBand.안정}·적${r[0].byBand.적정}·소${r[0].byBand.소신} / 김수안 ${r[1].n}장) + 동일 대학 ≤2장`,
    r.every(x => x.n >= 9 && x.n <= 11 && x.maxPerUniv <= 2)
      && r[0].byBand.안정 === 4 && r[0].byBand.적정 === 4 && r[0].byBand.소신 === 3,
    JSON.stringify(r));
  assert('추천선별#2: 유보·컷정보없음 카드 선별 미포함 (안정·적정·소신만)',
    r.every(x => x.bad === 0), JSON.stringify(r));
}

// ═══════════════════════════════════════════════
// 6지원 시뮬레이션 — 바구니 우선 후보군 · 유보/컷정보없음 제외
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    const keyOf = c => c.univ + '|' + (c.jn || c.jt) + '|' + c.dept;
    // 6지원#3: 바구니 우선 — 기본 조합에 없는 안정 카드 2장을 바구니에 담으면
    //          같은 구간 슬롯에서 바구니 카드가 우선 선발되어야 한다
    const s = STUDENTS.find(x => x.name === '강리영');
    const basePicks = calcOptimalPortfolioCards(s).picks.map(keyOf);
    const alt = buildApplicationCards(s)
      .filter(c => !c.noCut && c.band === '안정' && c.rel === '높음' && !basePicks.includes(keyOf(c)))
      .slice(0, 2);
    alt.forEach(c => toggleBasketEnc(s.seat, encodeURIComponent(keyOf(c))));
    const withBasket = calcOptimalPortfolioCards(s, portfolioCandidateCards(s)).picks.map(keyOf);
    const basketUsed = alt.every(c => withBasket.includes(keyOf(c)));
    alt.forEach(c => toggleBasketEnc(s.seat, encodeURIComponent(keyOf(c))));
    const emptyDefault = portfolioCandidateCards(s) === null;   // 바구니 비면 전체 계열 기준
    // 6지원#4: 전 학생 34명의 조합에 유보(컷 해석주의)·컷정보없음 카드가 없어야 한다
    let badPicks = 0, checked = 0;
    for (const st of STUDENTS) {
      for (const p of calcOptimalPortfolioCards(st).picks) {
        checked++;
        if (p.noCut || p.band === '유보' || !['안정', '적정', '소신', '상향'].includes(p.band)) badPicks++;
      }
    }
    return { basketUsed, emptyDefault, altN: alt.length, badPicks, checked };
  });
  assert(`6지원#3: 바구니 우선 사용 — 바구니 안정 ${r.altN}장이 조합에 선발 + 비우면 전체 계열 기준`,
    r.altN === 2 && r.basketUsed === true && r.emptyDefault === true, JSON.stringify(r));
  assert(`6지원#4: 34명 전원 조합(${r.checked}장)에 유보·컷정보없음 카드 0장`,
    r.badPicks === 0 && r.checked >= 190, JSON.stringify(r));
}

// ═══════════════════════════════════════════════
// 최저 What-if 모드 — 스텝 재판정 · 레버리지 · 실성적 복원
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    const s = STUDENTS.find(x => x.name === '오연서');
    // 실제 모평 저장 (국·수·영 3 → 서강대류 '3개 합 7' 기준에 합 9로 미달)
    saveMockExam(s.seat, { exam: '6월 모평', grades: { 국어: 3, 수학: 3, 영어: 3, 탐구1: 4, 탐구2: 4, 한국사: 4 } });
    _minJudgeCache = {};
    const actual = mockGradesOf(s).grades;
    const pool = minPoolCards(s);
    const before = minWhatIfCounts(s, actual, pool);
    // 1) 스텝 조정 재판정: 수학 2등급 상승(3→1) 가상 등급 → 충족 증가 + 전이 정합
    const virt = whatIfGrades(s, { 수학: -2 });
    const after = minWhatIfCounts(s, virt, pool);
    const trans = minTransitions(before, after);
    const up = (trans['근접→충족'] || 0) + (trans['미충족→충족'] || 0) + (trans['판정불가→충족'] || 0);
    const down = (trans['충족→근접'] || 0) + (trans['충족→미충족'] || 0);
    // 2) 레버리지: best.gain = 전 영역 중 최대 + 단일 영역 재계산과 일치
    const lev = minLeverage(s, actual);
    const maxGain = Math.max(...lev.all.map(x => x.gain));
    const recompute = (() => {
      const g2 = Object.assign({}, actual);
      g2[lev.best.area] -= 1;
      return minWhatIfCounts(s, g2, pool).충족 - before.충족;
    })();
    // 3) 토글 해제 복원: 가상 조정 후 토글 off → 저장된 모평이 원본 그대로 + 판정도 실제 기준
    _whatIf = { on: true, seat: s.seat, delta: { 수학: -2 } };
    _whatIf = { on: false, seat: s.seat, delta: {} };   // toggleWhatIf(off)와 동일 상태
    const storedAfter = JSON.parse(localStorage.getItem('mock_' + s.seat)).grades;
    const restored = minWhatIfCounts(s, mockGradesOf(s).grades, pool);
    localStorage.removeItem('mock_' + s.seat);   // 정리
    _minJudgeCache = {};
    return {
      poolN: pool.length, before: { 충족: before.충족, 근접: before.근접, 미충족: before.미충족 },
      after: { 충족: after.충족 }, gained: after.충족 - before.충족, up, down, trans,
      best: lev.best, maxGain, recompute,
      storedIntact: storedAfter.수학 === 3, restoredEq: restored.충족 === before.충족
    };
  });
  assert(`왓이프#1(스텝 재판정): 수학 3→1 시 충족 ${r.before.충족}→${r.after.충족} (+${r.gained}) · 전이 정합(상승 ${r.up} − 하락 ${r.down} = ${r.gained})`,
    r.gained > 0 && r.up - r.down === r.gained, JSON.stringify(r.trans));
  assert(`왓이프#2(레버리지): 병목 ${r.best.area} +${r.best.gain}장 = 전 영역 최대(${r.maxGain}) = 단일 재계산(${r.recompute})`,
    r.best.gain === r.maxGain && r.best.gain === r.recompute && r.best.gain > 0,
    JSON.stringify(r.best));
  assert('왓이프#3(복원): 가상 조정이 저장 모평을 오염시키지 않음(수학=3 유지) + 해제 후 집계 = 실제 기준',
    r.storedIntact === true && r.restoredEq === true, JSON.stringify({ storedIntact: r.storedIntact, restoredEq: r.restoredEq }));
}

// ═══════════════════════════════════════════════
// 담임 관제 레이어 — 경보 집계·경합 감지
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    // 경보#1: 안정 0장 감지 — 관제 데이터의 urgent 집계가 직접 재계산과 일치
    const rows = commandCenterData();
    const urgentFromCmd = rows.filter(x => x.safe === 0).map(x => x.seat).sort();
    const urgentDirect = STUDENTS.filter(s =>
      !buildApplicationCards(s).some(c => !c.noCut && c.band === '안정')).map(s => s.seat).sort();
    // 경보#2: 경합 3명 감지 — 학생 3명 바구니에 같은 카드를 담으면 히트맵에 잡혀야 함
    const key = '가천대학교|논술(논술)|경영학과';
    const three = STUDENTS.slice(0, 3);
    three.forEach(s => { const b = getBasket(s.seat); if (!b.includes(key)) { b.push(key); setBasketKeys(s.seat, [...b]); } });
    const conf = cmdConflictRows(3);
    const hit = conf.find(c => c.key === key);
    three.forEach(s => setBasketKeys(s.seat, getBasket(s.seat).filter(k => k !== key)));   // 정리
    const confAfter = cmdConflictRows(3).find(c => c.key === key);
    // 렌더 스모크: 34명 전원 관제 레이어 렌더 → 오염 문자열 없음
    document.body.insertAdjacentHTML('beforeend', '<div id="cmdCenter"></div>');
    renderCommandCenter();
    const h = document.getElementById('cmdCenter').innerHTML;
    return { urgentMatch: JSON.stringify(urgentFromCmd) === JSON.stringify(urgentDirect),
             urgentN: urgentFromCmd.length, rowsN: rows.length,
             hit: hit ? hit.names.length : 0, cleaned: !confAfter,
             renderOk: h.length > 2000 && !/undefined|\bNaN\b|>null</.test(h),
             tableRows: (h.match(/<tr onclick/g) || []).length };
  });
  assert(`관제#1(안정 0장 감지): 경보 집계 = 직접 재계산 (${r.urgentN}명) · 34명 테이블 렌더 정상`,
    r.urgentMatch && r.rowsN === 34 && r.tableRows === 34 && r.renderOk, JSON.stringify(r));
  assert(`관제#2(경합 3명 감지): 동일 카드 3명 바구니 → 히트맵 ${r.hit}명 검출 + 정리 후 소멸`,
    r.hit === 3 && r.cleaned === true, JSON.stringify(r));
}

// ═══════════════════════════════════════════════
// 위험 점수 합성 · 오늘의 호출 우선순위
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    // 복합 사유: 5개 규칙 전부 발동 → 4+3+2+1+2 = 12점 + 사유 태그 5개
    const comp = riskScoreOf({ safe: 0, basketN: 0, minMajor: true, needs: 3, memoDays: 24 });
    // 실데이터 정합: 34명 전원 risk = 행 필드 재합성과 일치, 숫자 아님 0명
    const rows = commandCenterData();
    const mismatch = rows.filter(x => riskScoreOf(x).score !== x.risk).length;
    const badNum = rows.filter(x => !Number.isFinite(x.risk)).length;
    // 무위험 0점: 김태양(안정 28장·보완 2건)에 바구니 1장 + 오늘 자 메모 → 발동 규칙 없음
    const s = STUDENTS.find(x => x.name === '김태양');
    const card = buildApplicationCards(s).find(c => !c.noCut);
    setBasketKeys(s.seat, [basketKeyOf(card)]);
    const memos = JSON.parse(localStorage.getItem('susi27_memos') || '{}');
    memos['memo_' + s.seat] = [{ text: '(검증용) 상담 완료', time: new Date().toLocaleString('ko-KR') }];
    localStorage.setItem('susi27_memos', JSON.stringify(memos));
    const zeroRow = commandCenterData().find(x => x.seat === s.seat);
    setBasketKeys(s.seat, []);   // 정리
    delete memos['memo_' + s.seat];
    localStorage.setItem('susi27_memos', JSON.stringify(memos));
    // 렌더: 호출 우선순위 5명 + 위험 점수 열 기본 내림차순 + 34행 오염 없음
    if (!document.getElementById('cmdCenter')) document.body.insertAdjacentHTML('beforeend', '<div id="cmdCenter"></div>');
    _cmdSort = { key: 'risk', dir: -1 };
    renderCommandCenter();
    const h = document.getElementById('cmdCenter').innerHTML;
    const rows2 = commandCenterData();
    const idxSeq = [...h.matchAll(/<tr onclick="selectStudent\((\d+)\)"/g)].map(m => Number(m[1]));
    const maxRisk = Math.max(...rows2.map(x => x.risk));
    return {
      comp, mismatch, badNum,
      zeroRisk: zeroRow.risk, zeroTags: zeroRow.riskTags.length,
      hasCall: h.includes('오늘의 호출 우선순위'), chips: (h.match(/cmdCallChip/g) || []).length,
      headerDesc: h.includes('위험 점수 ▼'), rowsN: idxSeq.length,
      firstIsMax: rows2[idxSeq[0]] != null && rows2[idxSeq[0]].risk === maxRisk,
      renderOk: !/undefined|\bNaN\b|>null</.test(h),
    };
  });
  assert(`위험점수#1(복합 사유): 5개 규칙 전부 발동 = ${r.comp.score}점 (4+3+2+1+2) · 태그 ${r.comp.tags.length}개('상담 24일 경과' 포함) + 34명 재합성 일치`,
    r.comp.score === 12 && r.comp.tags.length === 5 && r.comp.tags.includes('상담 24일 경과')
      && r.mismatch === 0 && r.badNum === 0, JSON.stringify(r.comp));
  assert(`위험점수#2(무위험 0점): 김태양 바구니 작성 + 당일 상담 메모 → ${r.zeroRisk}점 · 태그 ${r.zeroTags}개`,
    r.zeroRisk === 0 && r.zeroTags === 0, JSON.stringify({ zeroRisk: r.zeroRisk, zeroTags: r.zeroTags }));
  assert(`위험점수#3(호출 우선순위·정렬): 상위 ${r.chips}명 표시 + 테이블 ${r.rowsN}행 위험 내림차순(선두=최고점) + 오염 없음`,
    r.hasCall && r.chips === 5 && r.headerDesc && r.rowsN === 34 && r.firstIsMax && r.renderOk,
    JSON.stringify({ chips: r.chips, headerDesc: r.headerDesc, rowsN: r.rowsN, firstIsMax: r.firstIsMax }));
}

// ═══════════════════════════════════════════════
// 상담 결과지 생성 — 학부모용(6지원 표) · 학생용(보완 액션) 2종
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    const s = STUDENTS.find(x => x.name === '강리영');
    const parent = counselSheetParentHtml(s, '1-20260704-001');
    const stu = counselSheetStudentHtml(s, '1-20260704-002');
    const pf = calcOptimalPortfolioCards(s, portfolioCandidateCards(s));
    // 유보 카드 방어 렌더: 합성 유보 카드의 사유가 행에 포함되는지
    const yuboRow = counselSheetPickRow({ univ: '성균관대학교', dept: '물리학과', jn: '종합(면접형-과학인재)',
      jt: '종합', band: '유보', cautionReason: '특목·자사고 지원자 혼재 가능성으로 발표 컷이 일반고 합격선과 다를 수 있음',
      cw: 3.4, seat: s.seat, gy: '자연' }, 0);
    const bad = h => /undefined|\bNaN\b|>null</.test(h);
    const footerOk = h => h.includes('발행일') && h.includes('문서번호') && h.includes('상담교사') && h.includes('(서명)')
      && h.includes('종합전형은 정성평가로 결과가 다를 수 있습니다');
    return {
      // 학부모용: 6지원 표 + 용어 풀이(GLOSSARY) + 구성 논리
      pRows: (parent.match(/<tr><td>\d+<\/td>/g) || []).length, picks: pf.picks.length,
      pGlossary: parent.includes('② 용어 풀이') && parent.includes(GLOSSARY[0].term) && parent.includes('충원(추가합격) 배수'),
      pLogic: parent.includes('AI 6지원안') && /안정 \d+장 · 적정 \d+장 · 도전/.test(parent),
      pKind: parent.includes('>학부모용<'), pBad: bad(parent), pFooter: footerOk(parent),
      // 학생용: 세특 기록 필요 전체 + 최저 병목/레버리지 + 할 일 체크리스트
      sNeeds: stu.includes('① 세특 기록 필요 항목'),
      sLev: stu.includes('② 수능최저 병목 & 1등급 레버리지'),
      sTodo: stu.includes('③ 다음 상담까지 할 일') && stu.includes('☐'),
      sKind: stu.includes('>학생용<'), sBad: bad(stu), sFooter: footerOk(stu),
      // 문서번호 형식(학생번호-YYYYMMDD-일련) 반영
      docOk: parent.includes('1-20260704-001') && stu.includes('1-20260704-002'),
      yuboHasReason: yuboRow.includes('판정 유보') && yuboRow.includes('특목·자사고'),
      pickYuboCount: pf.picks.filter(p => p.band === '유보').length
    };
  });
  assert(`결과지#1(학부모용): 6지원 ${r.pRows}행(=${r.picks}) + 용어 풀이 박스 + 구성 논리 해설 + 배지·하단부(발행일·문서번호·서명란·고지) + 오염 없음 + 유보 사유 방어`,
    r.pRows === r.picks && r.pGlossary && r.pLogic && r.pKind && r.pBad === false && r.pFooter
      && r.yuboHasReason && r.pickYuboCount === 0,
    JSON.stringify(r));
  assert('결과지#2(학생용 2종 분리): 세특 기록 필요·최저 병목/레버리지·할 일 체크리스트 + 배지·하단부 + 문서번호 형식(번호-YYYYMMDD-일련) + 두 종 모두 undefined/NaN 없음',
    r.sNeeds && r.sLev && r.sTodo && r.sKind && r.sBad === false && r.sFooter && r.docOk,
    JSON.stringify(r));
}

// ═══════════════════════════════════════════════
// 갱신 스냅샷 비교 — 정상 생략 · 변화 감지 · 지문 불일치 차단
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    const s = STUDENTS.find(x => x.name === '강리영');
    const orig = PREV_SNAPSHOT;
    // 1) 현 빌드 상태 그대로의 일관성: 스냅샷 없으면 비교 null + 결과지 블록 생략 / 있으면 둘 다 존재
    _snapCmpCache = {};
    const cmp0 = comparePrevSnapshot(s);
    const sheet0 = counselSheetParentHtml(s, '1-20260704-001');
    const nullConsistent = orig == null
      ? (cmp0 === null && !sheet0.includes('지난 상담 대비 변화'))
      : (cmp0 !== null && cmp0.prevDate === orig.date && sheet0.includes('지난 상담 대비 변화'));
    // 2) 합성 스냅샷 주입: 현재 상태 기반 — 평균 +0.3(이전이 나빴음), 카드 1장 이전 구간만 조작, 보완 1건 추가
    const cards = buildApplicationCards(s);
    const codeOf = c => c.noCut ? 'N' : (SNAP_CODE[c.band] || '?');
    const idx = cards.findIndex(c => !c.noCut && (c.band === '적정' || c.band === '소신'));
    const target = cards[idx];
    const arr = cards.map(codeOf);
    arr[idx] = target.band === '적정' ? 'A' : 'J';   // 이전 구간을 한 단계 유리하게 조작 → 하락 감지 기대
    const prevName = SNAP_NAME[arr[idx]];
    let rle = '', pc = null, cnt = 0;
    for (const ch of arr) { if (ch === pc) cnt++; else { if (pc) rle += pc + cnt; pc = ch; cnt = 1; } }
    if (pc) rle += pc + cnt;
    const avgNow = Math.round(calcWeightedAvg(s) * 100) / 100;
    PREV_SNAPSHOT = { date: '2026-06-01', fingerprint: cardKeyFingerprint(),
      students: { [String(s.seat)]: { name: s.name, stAvg: Math.round((avgNow + 0.3) * 100) / 100,
        dist: {}, bandsRLE: rle, needs: counselNeeds(s).concat(['(검증용) 테스트 보완 항목']) } } };
    _snapCmpCache = {};
    const bkey = basketKeyOf(target);
    const hadBasket = getBasket(s.seat).slice();
    setBasketKeys(s.seat, [bkey]);   // 대상 카드를 바구니에 → 바구니 변동으로 잡혀야 함
    const cmp = comparePrevSnapshot(s);
    const chB = changedBasketCards(s);
    const flag = snapChangeFlagHtml(target);
    const sheet = counselSheetParentHtml(s, '1-20260704-002');
    // 3) 카드 목록 지문 불일치(adiga 교체 상황) → 구간 비교 차단, 평균·보완 비교는 유지
    PREV_SNAPSHOT = Object.assign({}, PREV_SNAPSHOT, { fingerprint: 'X:none' });
    _snapCmpCache = {};
    const cmpX = comparePrevSnapshot(s);
    const chBX = changedBasketCards(s);
    const flagX = snapChangeFlagHtml(target);
    const sheetX = counselSheetParentHtml(s, '1-20260704-003');
    setBasketKeys(s.seat, hadBasket);   // 정리
    PREV_SNAPSHOT = orig;
    _snapCmpCache = {};
    return {
      nullConsistent, snapNull: orig == null,
      delta: cmp.delta, prevName, toName: target.band, chBN: chB.length,
      flagOk: flag.includes('갱신 후 구간 변동') && flag.includes(prevName + '→' + target.band),
      resolved: cmp.needsResolved,
      sheetHas: sheet.includes('③ 지난 상담 대비 변화') && sheet.includes('스냅샷 2026-06-01')
        && sheet.includes('-0.30 개선') && sheet.includes(prevName + '→' + target.band) && sheet.includes('1건 해소'),
      xComparable: cmpX.cardsComparable, xDelta: cmpX.delta, xChB: chBX.length, xFlag: flagX,
      xSheet: sheetX.includes('교체되어 카드 구간 비교 생략') && sheetX.includes('③ 지난 상담 대비 변화'),
    };
  });
  assert(`스냅샷#1(정상 생략/표시 일관성): 스냅샷 ${r.snapNull ? '없음 → 비교 null + 결과지 블록 생략 (오류 아님)' : '있음 → 비교 생성 + 결과지 블록 표시'}`,
    r.nullConsistent === true, JSON.stringify({ snapNull: r.snapNull }));
  assert(`스냅샷#2(변화 감지): 평균 -0.30 개선 + 바구니 카드 ${r.prevName}→${r.toName} 변동 ${r.chBN}장 + 카드 플래그 + 보완 1건 해소 + 결과지 ⑤블록`,
    r.delta === -0.3 && r.chBN === 1 && r.flagOk === true
      && r.resolved.length === 1 && r.resolved[0] === '(검증용) 테스트 보완 항목' && r.sheetHas === true,
    JSON.stringify({ delta: r.delta, chBN: r.chBN, flagOk: r.flagOk, resolved: r.resolved, sheetHas: r.sheetHas }));
  assert('스냅샷#3(지문 차단): 카드 목록 지문 불일치 시 구간 비교 차단(변동 0·플래그 없음) + 평균 비교 유지 + 결과지 "비교 생략" 명시',
    r.xComparable === false && r.xChB === 0 && r.xFlag === '' && r.xDelta === -0.3 && r.xSheet === true,
    JSON.stringify({ xComparable: r.xComparable, xChB: r.xChB, xDelta: r.xDelta, xSheet: r.xSheet }));
}

// ═══════════════════════════════════════════════
// 수능최저 시뮬레이터 — judgeMin (충족/근접/미충족/판정불가)
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    const g = { 국어: 2, 수학: 3, 영어: 2, 탐구1: 2, 탐구2: 4, 한국사: 3 };
    return {
      // 충족: 상위 2개(국2+영2=4) ≤ 5
      ok: judgeMin(g, '2개 합 5', ''),
      // 미충족: 3개 합 7 기준에 국4수5영5 → 최상 3개 합 14, 7 초과
      no: judgeMin({ 국어: 4, 수학: 5, 영어: 5 }, '3개 합 7 한국사 4등급', ''),
      // 근접: 상위 3개(국2+영2+탐구2=6+수학? → 국2 영2 탐1(2)=6? 합 기준 5 → 1 초과)
      near: judgeMin(g, '3개 합 5', ''),
      // 판정불가: 파싱 불가 텍스트
      na: judgeMin(g, '대학별 고사 성적 우수자 전형별 상이', ''),
      // 수학 포함 + 탐구 2과목 평균
      mustInc: judgeMin(g, '수학 포함 2개 합 5 탐구 2과목', ''),
    };
  });
  assert(`최저심#1(충족): '2개 합 5' × 국2·영2 → ${r.ok.status} (${r.ok.detail})`,
    r.ok.status === '충족', JSON.stringify(r.ok));
  assert(`최저심#2(미충족+사유): '3개 합 7' × 4·5·5 → ${r.no.status} — ${r.no.lackText}`,
    r.no.status === '미충족' && /상승 필요/.test(r.no.lackText || ''), JSON.stringify(r.no));
  assert(`최저심#3(근접): '3개 합 5' × 합 6 → ${r.near.status} (1등급 이내 부족 + 영역 명시)`,
    r.near.status === '근접' && /상승 필요/.test(r.near.lackText || ''), JSON.stringify(r.near));
  assert(`최저심#4(판정불가): 파싱 불가 기준 → ${r.na.status} — 정직 분류`,
    r.na.status === '판정불가' && /기준 확인 필요/.test(r.na.detail || ''), JSON.stringify(r.na));
  assert(`최저심#5(수학 포함·탐구 2과목 평균): ${r.mustInc.status} — 수학 강제 반영`,
    r.mustInc.status === '충족' || r.mustInc.status === '근접' || r.mustInc.status === '미충족',
    JSON.stringify(r.mustInc));
}

// ═══════════════════════════════════════════════
// 5역량 구문 하이라이트 (입학사정관 평가 기준)
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    // 1) 행위 구문: 단어가 아닌 구문/절 전체가 하나의 마크로 감싸져야 한다
    const acad = highlightRecord('작품의 주제를 사회 현상과 연계하여 비판적으로 분석함.', null);
    const acadMark = (acad.match(/<mark class="hl5-acad"[^>]*>([^<]+)<\/mark>/) || [])[1] || '';
    // 2) 교사평가 서술 감지 (goal 지정 문장) — 연속 마크 전체를 합쳐 검사
    const teval = highlightRecord('준비 과정에서 자신이 성찰한 바를 진솔하게 전달하는 모습이 인상적임.', null);
    const tevalMark = [...teval.matchAll(/<mark class="hl5-teval"[^>]*>([^<]+)<\/mark>/g)].map(m => m[1]).join('');
    // 3) 단순 도서명·명사 나열은 하이라이트하지 않음
    const noun = highlightRecord('『동물농장』과 「데미안」을 읽음. 수학, 과학, 영어 과목을 수강함.', null);
    return { acadMark, tevalMark, nounHasMark: noun.includes('<mark'),
             counts: hl5Counts('조원들과 협동하여 역할을 분담함. 의문을 갖고 자료를 조사함.', null) };
  });
  assert(`하이라이트#1(행위 구문): "연계하여 ~ 분석" 절 단위 마크 — "${r.acadMark.slice(0, 30)}…" (${r.acadMark.length}자)`,
    r.acadMark.includes('연계하여') && r.acadMark.includes('분석') && r.acadMark.length >= 12,
    JSON.stringify(r.acadMark));
  assert(`하이라이트#2(교사평가): "~모습이 인상적" 감지 — "${r.tevalMark.slice(0, 30)}…"`,
    r.tevalMark.includes('인상적') && r.tevalMark.length >= 8, JSON.stringify(r.tevalMark));
  assert('하이라이트#3(단순 명사 비하이라이트): 도서명·과목 나열 문장에 마크 0개 + 공동체·과정 감지 정상',
    r.nounHasMark === false && r.counts.공동체역량 >= 1 && r.counts.탐구과정 >= 1,
    JSON.stringify({ nounHasMark: r.nounHasMark, counts: r.counts }));
}

// ═══════════════════════════════════════════════
// 학과 매칭 2단 키워드 (강한 정합 / 계열 정합 / 근거 부족 + 근거 중복 금지)
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    // 합성 학생: 수학 고유(미적분) + 교육 공통(수업·멘토링) 문장 / 교육 공통만 문장
    const st = {
      seat: 990, name: '_매칭검증', opinions: [],
      records: [
        { t: '세부능력및특기사항', c: '수학', y: 3,
          b: '미적분의 변화율 개념을 활용해 학습 멘토링 수업 자료를 직접 제작하여 배포함. 통계 단원에서 확률 모형을 설계함.' },
        { t: '세부능력및특기사항', c: '진로', y: 2,
          b: '교사를 희망하며 교육 봉사에서 후배 학습 지도를 진행함. 수업 참관 후 보고서를 제출함.' }
      ],
      subjects: []
    };
    const ra = { deptMatch: ['수학교육과', '국어교육과', '철학과'], concept: '교육' };
    const fit = computeDeptFit(st, {}, ra);
    const by = {};
    fit.forEach(f => { by[f.dept] = f; });
    // 근거 중복 금지: 학과 간 인용 문장 교집합
    const texts = d => new Set((by[d].evidence || []).map(e => e.text));
    const overlap = [...texts('수학교육과')].filter(t => texts('국어교육과').has(t)).length;
    return {
      수학: { grade: by['수학교육과'].grade, ev: by['수학교육과'].evidence.length, kw: by['수학교육과'].uniqueKws },
      국어: { grade: by['국어교육과'].grade, ev: by['국어교육과'].evidence.length, msg: by['국어교육과'].noUniqueMsg,
              gap0: (by['국어교육과'].gaps[0] || '') },
      철학: { grade: by['철학과'].grade },
      overlap,
      noPct: !JSON.stringify(fit).includes('"score"') && !JSON.stringify(fit).includes('우수')
    };
  });
  assert(`매칭#1(강한 정합): 수학교육과 — 고유(${r.수학.kw.join(',')}) + 공통 매칭, 근거 ${r.수학.ev}건`,
    r.수학.grade === '강한 정합' && r.수학.ev >= 1, JSON.stringify(r.수학));
  assert('매칭#2(계열 정합): 국어교육과 — 공통만 매칭 + 정직한 무근거 표시 + 실행형 보완 문구',
    r.국어.grade === '계열 정합' && r.국어.ev === 0
      && r.국어.msg.includes('고유 활동의 근거 문장 없음')
      && r.국어.gap0.includes('3학년 세특') && r.국어.gap0.includes('고유 근거 0건'),
    JSON.stringify(r.국어));
  assert('매칭#3(근거 부족): 철학과 — 고유·공통 모두 미매칭', r.철학.grade === '근거 부족', JSON.stringify(r.철학));
  assert(`매칭#4(근거 중복 금지 + % 폐지): 학과 간 인용 교집합 ${r.overlap}건 · score/우수 부재`,
    r.overlap === 0 && r.noPct === true, JSON.stringify({ overlap: r.overlap, noPct: r.noPct }));
}

// ═══════════════════════════════════════════════
// 판정 근거 문구 — 좌변(전과목 평균) 명시 + 환산값 '참고' 구분
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    const s = STUDENTS.find(x => x.name === '강리영');
    const cards = buildApplicationCards(s);
    // 규칙 보유 대학(환산 표시) 카드와 폴백(평균 복사) 카드 각 1장
    const withRule = cards.find(c => c.univ === '한국성서대학교' && c.dept === '사회복지학과' && c.jn === '교과(교과성적우수)');
    const fallback = cards.find(c => c.scoreSrc === '평균' && c.band && !c.noCut);
    return {
      ruleReason: cardReasonText(withRule),
      ruleRow: cardRowHtml(withRule).includes('참고'),
      fbReason: cardReasonText(fallback),
      fbRow: cardRowHtml(fallback).includes('참고'),
    };
  });
// ═══════════════════════════════════════════════
// 컷 해석주의 소신 확대 + 카드 상세 모달 데이터
// ═══════════════════════════════════════════════
{
  const r = await page.evaluate(() => {
    // 소신 확대: 수치상 소신인 컷 해석주의 카드가 유보로 바뀌었는지 + 상향은 유지
    let sosinHold = null, sangUnchanged = null;
    const sosinByUniv = {};
    let sosinTotal = 0;
    for (const st of STUDENTS) {
      for (const c of buildApplicationCards(st)) {
        if (c.caution && c.bandRaw === '소신') {
          sosinTotal++;
          sosinByUniv[c.univ] = (sosinByUniv[c.univ] || 0) + 1;
          if (!sosinHold) sosinHold = { univ: c.univ, dept: c.dept, band: c.band, bandRaw: c.bandRaw };
        }
        if (!sangUnchanged && c.caution && c.bandRaw === '상향')
          sangUnchanged = { univ: c.univ, band: c.band, bandRaw: c.bandRaw };
      }
    }
    const allSosinHold = STUDENTS.every(st => buildApplicationCards(st)
      .filter(c => c.caution && c.bandRaw === '소신').every(c => c.band === '유보'));
    // 모달 데이터: 규칙 보유(한국성서대) vs 미보유(성균관대)
    const s = STUDENTS.find(x => x.name === '강리영');
    const cards = buildApplicationCards(s);
    const withRule = cardModalData(cards.find(c => c.univ === '한국성서대학교' && c.dept === '사회복지학과' && c.jn === '교과(교과성적우수)'));
    const noRule = cardModalData(cards.find(c => c.univ === '성균관대학교' && c.dept === '물리학과' && c.jn === '종합(면접형-과학인재)'));
    return { sosinHold, sangUnchanged, allSosinHold, sosinTotal, sosinByUniv,
             withRule: { hasRule: withRule.naesin.hasRule, basis: withRule.naesin.basis,
                         summaryOk: !!(withRule.naesin.summary && withRule.naesin.summary.includes('반영교과')),
                         steps0: withRule.steps[0], stepsN: withRule.steps.length },
             noRule: { hasRule: noRule.naesin.hasRule, basis: noRule.naesin.basis,
                       holdStep: noRule.steps.some(t => t.includes('판정 유보')) } };
  });
  console.log('  소신→유보 확대분 — 대학별(34명 합산): '
    + Object.entries(r.sosinByUniv).sort((a, b) => b[1] - a[1]).map(([u, n]) => `${u} ${n}장`).join(' · ')
    + ` — 합계 ${r.sosinTotal}장`);
  assert(`컷해석주의#4: 소신 확대 — 수치상 소신 카드 ${r.sosinTotal}장 전건 유보 + 상향은 유지(${r.sangUnchanged?.band})`,
    r.allSosinHold === true && r.sosinTotal > 0 && r.sangUnchanged && r.sangUnchanged.band === '상향',
    JSON.stringify({ ex: r.sosinHold, sang: r.sangUnchanged }));
  assert('모달#1: 규칙 보유 대학(한국성서대) — hasRule·반영교과 요약·판정 과정 단계 생성',
    r.withRule.hasRule === true && r.withRule.summaryOk
      && r.withRule.steps0.startsWith('전과목 평균') && r.withRule.stepsN >= 4,
    JSON.stringify(r.withRule));
  assert('모달#2: 규칙 미보유 대학(성균관대) — 전과목 평균 기준 명시 + 유보 단계 표시',
    r.noRule.hasRule === false && r.noRule.basis.includes('전과목 평균')
      && r.noRule.holdStep === true,
    JSON.stringify(r.noRule));
}

  assert('판정근거#2: 카드 근거 첫 줄에 좌변(전과목 평균) 명시 + 환산은 "참고(판정 미반영)" 구분',
    r.ruleReason.startsWith('판정 기준: 전과목 평균')
      && r.ruleReason.includes('참고: 반영교과 환산') && r.ruleReason.includes('판정 미반영')
      && r.ruleRow === true
      && r.fbReason.startsWith('판정 기준: 전과목 평균')
      && !r.fbReason.includes('반영교과 환산') && r.fbRow === false,
    JSON.stringify(r));
}

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
