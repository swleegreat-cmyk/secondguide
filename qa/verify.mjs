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
