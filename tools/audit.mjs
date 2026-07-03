// audit.mjs — 불변식 감사 (20분 루프용). 위반 시 [FAIL] + exit 1.
// golden_cases.json 기대값은 절대 수정 대상이 아니며, 위반 시 원인 코드를 고쳐야 한다.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SCRATCH = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox']
});
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
await page.goto('file:///home/user/secondguide/susi-counseling-2027.html');
await page.waitForTimeout(1200);

const results = [];
const check = (name, cond, info) => results.push({ name, pass: !!cond, info });

// 불변식 1: classifyBand 사다리 — 성적·컷 양방향 단조성 + 역전 컷 정규화
{
  const r = await page.evaluate(() => {
    const rank = { '상향': 0, '소신': 1, '적정': 2, '안정': 3 };
    let ok = true;
    for (let s = 1.0; s <= 9.0; s += 0.25) {
      const prev = classifyBand(s - 0.25, 3.0, 3.4), cur = classifyBand(s, 3.0, 3.4);
      if (prev && cur && rank[cur] > rank[prev]) ok = false; // 성적 나빠지는데 판정 유리 → 위반
    }
    const inverted = classifyBand(2.47, 2.6, 1.9); // 역전 컷 (g50>g70) 정규화 확인
    return { ok, inverted };
  });
  check('불변식1: classifyBand 단조성 + 역전 컷 정규화', r.ok && r.inverted !== null, JSON.stringify(r));
}
// 불변식 2: DEPT_CUTLINES 키 내 전형명 중복 0
{
  const dup = await page.evaluate(() => {
    let d = 0;
    for (const list of Object.values(DEPT_CUTLINES)) {
      const seen = {};
      for (const e of list) { if (seen[e.jn]) d++; seen[e.jn] = 1; }
    }
    return d;
  });
  check('불변식2: DEPT_CUTLINES 전형명 중복 0건', dup === 0, `dup=${dup}`);
}
// 불변식 3: factorBreakdown 합 = 100 (샘플 3학생 × 3대학)
{
  const r = await page.evaluate(() => {
    for (const si of [0, 15, 33]) {
      const s = STUDENTS[si], a = ANALYSIS[s.seat] || {};
      for (const ur of runAllUniversities(s).slice(0, 3)) {
        const c = calcCompositeScore(ur, s, a);
        if (c.factorBreakdown.reduce((x, f) => x + f.pct, 0) !== 100) return false;
      }
    }
    return true;
  });
  check('불변식3: 기여도 breakdown 합 100', r === true, String(r));
}
// 불변식 4: 태깅 등급 규칙 (kinds→grade 매핑)
{
  const r = await page.evaluate(() => {
    const a = tagSentence('『동물농장』을 읽고 5회 발표함');     // 고유+정량 2종 → 상
    const b = tagSentence('보고서를 제출함');                    // 1종 → 중
    const c = tagSentence('즐겁게 지냄');                        // 0종 → 하
    return a.grade === '상' && b.grade === '중' && c.grade === '하';
  });
  check('불변식4: 태깅 kinds→grade 매핑 (2종=상/1종=중/0종=하)', r === true, String(r));
}
// 불변식 5: golden_cases.json 구조 (25건 · 기대값 채워진 건수 ≥ 11 · 필수 필드)
{
  const gc = JSON.parse(readFileSync(join(SCRATCH, 'golden_cases.json'), 'utf8'));
  const filled = gc.filter(c => c.기대환산점수 != null).length;
  check('불변식5: golden_cases 25건 · 기대값 ≥11건 유지', gc.length === 25 && filled >= 11, `n=${gc.length}, filled=${filled}`);
}
// 불변식 6: 판정 신뢰도 등급 규칙 전수 일치
{
  const mismatch = await page.evaluate(() => {
    const ruleOf = e => {
      const numOk = e.num != null && !isNaN(parseFloat(e.num));
      const chuOk = e.chu != null && !isNaN(parseFloat(e.chu));
      if (e.g50 == null && e.g70 == null) return '낮음';
      if (e.g50 != null && e.g70 != null && chuOk && numOk && parseFloat(e.num) >= 10) return '높음';
      return '보통';
    };
    let m = 0;
    for (const list of Object.values(DEPT_CUTLINES)) for (const e of list) if (ruleOf(e) !== e.rel) m++;
    return m;
  });
  check('불변식6: 판정 신뢰도 등급 규칙 전수 일치', mismatch === 0, `mismatch=${mismatch}`);
}
// ═══════════════════════════════════════════════
// 불변식 7~10: 전체 학생 34명 × 전체 카드 전수 검사
// 위반은 "학생/카드/유형" 목록 + 유형별 집계로 출력한다.
// ═══════════════════════════════════════════════
const V_SAMPLE = 10;  // 유형별 위반 샘플 출력 상한
const sweep = await page.evaluate(() => {
  const RANK = { '안정': 3, '적정': 2, '소신': 1, '상향': 0 };
  const ACH = { A: 1, B: 3, C: 5 };
  const via = [], vib = [], vid = [];
  const cardId = c => `${c.univ} ${c.dept} ${c.jn}`;

  // (b)용 2D 단조성 검사 — 지배쌍(loX≥loY && hiX≥hiY)에서 rank(X) < rank(Y)면 위반.
  // classifyBand는 lo=min(g50,g70), hi=max 기준 사다리이므로 (lo,hi) 동시 우세(=등급 여유가
  // 더 큰) 카드의 판정은 절대 더 불리할 수 없다. BIT prefix-max로 O(n log n) 전수 검사.
  function checkMonotone(items) {
    const his = [...new Set(items.map(i => i.hi))].sort((x, y) => x - y);
    const idx = new Map(his.map((v, i) => [v, i + 1]));
    const tree = new Array(his.length + 1).fill(-1);
    const treeRef = new Array(his.length + 1).fill(null);
    const update = (i, r, ref) => { for (; i <= his.length; i += i & -i) if (r > tree[i]) { tree[i] = r; treeRef[i] = ref; } };
    const query = i => { let m = -1, ref = null; for (; i > 0; i -= i & -i) if (tree[i] > m) { m = tree[i]; ref = treeRef[i]; } return { m, ref }; };
    items.sort((a, b) => a.lo - b.lo || a.hi - b.hi);
    const bad = [];
    for (const it of items) {
      const q = query(idx.get(it.hi));
      if (q.m > it.rank) bad.push({ worse: it.ref, better: q.ref });
      update(idx.get(it.hi), it.rank, it.ref);
    }
    return bad;
  }

  // (d)용: 같은 카드를 렌더하는 3곳(cardRowHtml/cardDetailHtml/bandBadge)의 배지 구간 토큰 대조.
  // 라벨 문구는 달라도('충원 감안 시 X', '판정 유보(컷 해석주의)') 구간 토큰은 같아야 한다.
  const token = html => {
    const badge = (html.match(/font-weight:800[^>]*>([^<]*)</) || [])[1];
    if (badge) return (badge.match(/(안정|적정|소신|상향|유보)/) || [])[1] || badge.trim();
    return /컷 정보 없음/.test(html) ? '컷없음' : '?';
  };
  const seenTuple = new Set();

  for (const s of STUDENTS) {
    // (a) 환산·평균등급이 학생의 최고(최상) 과목등급보다 유리하면 위반.
    //     최고 과목등급 = 석차등급(1~9)과 성취도 환산(A1/B3/C5)을 통틀어 가장 작은 값.
    //     단위가중 평균/반영교과 환산은 최상 구성요소보다 좋아질 수 없다. (반올림 여유 0.011)
    let bestEff = 9;
    for (const sub of s.subjects) {
      if (sub.g != null && sub.g >= 1 && sub.g <= 9) bestEff = Math.min(bestEff, sub.g);
      else if (sub.a && ACH[sub.a]) bestEff = Math.min(bestEff, ACH[sub.a]);
    }
    const cards = buildApplicationCards(s);
    const monoItems = { boost: [], plain: [] };
    for (const c of cards) {
      if (c.stAvg < bestEff - 0.011)
        via.push(`${s.name}/${cardId(c)}/평균 ${c.stAvg} < 최고 과목등급 ${bestEff}`);
      else if (c.score < bestEff - 0.011)
        via.push(`${s.name}/${cardId(c)}/환산 ${c.score}(${c.scoreSrc}) < 최고 과목등급 ${bestEff}`);
      // (b) 대상: 판정이 있는 카드. 유보(컷 해석주의)는 판정을 유보한 카드라 사다리 비교에서 제외.
      //     충원 보정(cw≥1.0)은 한 단계 상향이므로 보정군/비보정군을 나눠 각각 검사.
      if (c.band && c.band !== '유보' && !c.caution) {
        const a = c.g50 != null ? c.g50 : c.g70, b = c.g70 != null ? c.g70 : c.g50;
        (c.cw != null && c.cw >= 1.0 ? monoItems.boost : monoItems.plain).push({
          lo: Math.min(a, b), hi: Math.max(a, b), rank: RANK[c.band],
          ref: `${cardId(c)} [${c.band}]`
        });
      }
      // (d) 배지 일관성 — 라벨 결정 인자 튜플별 1회 렌더 (전 카드가 튜플로 커버됨)
      const tup = `${s.seat}|${c.band}|${c.bandAdjusted}|${c.caution}|${c.cw == null}`;
      if (!seenTuple.has(tup)) {
        seenTuple.add(tup);
        const t1 = token(cardRowHtml(c));
        const t2 = token(cardDetailHtml(c, null));
        const t3 = token(bandBadge(c.band, c.noCutLabel, c));
        const want = c.band || '컷없음';
        if (!(t1 === want && t2 === want && t3 === want))
          vid.push(`${s.name}/${cardId(c)}/배지 불일치 row=${t1} detail=${t2} badge=${t3} (기대 ${want})`);
      }
    }
    for (const part of ['plain', 'boost']) {
      for (const bad of checkMonotone(monoItems[part]))
        vib.push(`${s.name}/${bad.worse}가 ${bad.better}보다 여유 크나 판정 불리 (${part})`);
    }
  }
  return { via, vib, vid,
           cardTotal: STUDENTS.reduce((n, s) => n + buildApplicationCards(s).length, 0) };
});

// (c) 카드 표시 컷 값 = adiga 원본 — 학생 무관이므로 컷 엔트리 전수 1회 대조.
//     excel_ingest.py의 중복 처리(등급 완전성 → 모집인원 → 선착순)와 canon()을 재현해
//     원본에서 채택됐어야 할 행과 비교한다. golden_cases.json은 관여하지 않는다.
const vic = await (async () => {
  const alias = JSON.parse(readFileSync('/home/user/secondguide/tools/univ_alias.json', 'utf8'));
  const canon = n => {
    if (n == null) return '';
    n = String(n).replace(/ /g, '').trim();
    if (!n) return '';
    if (alias[n]) return alias[n];
    let head = n, paren = '';
    const i = n.indexOf('(');
    if (i >= 0) { head = n.slice(0, i); paren = n.slice(i); }
    if (head.endsWith('대') && !head.endsWith('대학교')) head += '학교';
    return head + paren;
  };
  const raw = JSON.parse(readFileSync('/home/user/secondguide/tools/adiga.json', 'utf8').replace(/:\s*NaN/g, ': null'));
  const groups = new Map();
  raw.forEach((r, i) => {
    // excel_ingest.py와 동일: 학과는 strip, 전형은 원문 유지 (선행 공백 학과 사례: ' 무대미술전공')
    const k = `${canon(r['대학'])}|${String(r['학과'] ?? '').trim()}|${r['전형']}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ r, i });
  });
  const gradeOk = v => typeof v === 'number' && v >= 1 && v <= 9;      // 중복 제거 완전성 판정 (_grade_ok)
  const gVal = v => (typeof v === 'number' && !isNaN(v) && v >= 0.5 && v <= 9.0)
    ? Math.round(v * 100) / 100 : null;                                 // 저장 값 변환 (_g: round 2 + 범위 밖 null)
  const numOr = v => (typeof v === 'number' && !isNaN(v)) ? v : -1;
  const entries = await page.evaluate(() => {
    const out = [];
    for (const [k, list] of Object.entries(DEPT_CUTLINES)) {
      const bar = k.indexOf('|');
      for (const e of list) out.push({ univ: k.slice(0, bar), dept: k.slice(bar + 1), jn: e.jn, g50: e.g50, g70: e.g70 });
    }
    return out;
  });
  const bad = [];
  for (const e of entries) {
    const cand = groups.get(`${e.univ}|${e.dept}|${e.jn}`);
    if (!cand || !cand.length) { bad.push(`(전원)/${e.univ} ${e.dept} ${e.jn}/원본 행 없음`); continue; }
    const kept = cand.slice().sort((x, y) => {
      const cx = gradeOk(x.r['등급50']) + gradeOk(x.r['등급70']), cy = gradeOk(y.r['등급50']) + gradeOk(y.r['등급70']);
      return (cy - cx) || (numOr(y.r['모집인원']) - numOr(x.r['모집인원'])) || (x.i - y.i);
    })[0].r;
    if (String(e.g50 ?? '') !== String(gVal(kept['등급50']) ?? '') || String(e.g70 ?? '') !== String(gVal(kept['등급70']) ?? ''))
      bad.push(`(전원)/${e.univ} ${e.dept} ${e.jn}/카드 ${e.g50}·${e.g70} ≠ 원본 ${kept['등급50']}·${kept['등급70']}`);
  }
  return { bad, entryTotal: entries.length };
})();

console.log(`──── 전수 불변식 7~10 (학생 34명 × 카드 ${sweep.cardTotal.toLocaleString()}장 · 컷 엔트리 ${vic.entryTotal.toLocaleString()}건) ────`);
const TYPES = [
  ['a', '환산·평균이 최고 과목등급보다 유리', sweep.via],
  ['b', '등급 여유 큰 카드가 판정 불리(지배쌍)', sweep.vib],
  ['c', '카드 표시 컷 ≠ adiga 원본', vic.bad],
  ['d', '판정 배지 표시처 간 불일치', sweep.vid],
];
console.log('유형별 집계: ' + TYPES.map(([t, , list]) => `(${t}) ${list.length}건`).join(' · '));
for (const [t, desc, list] of TYPES) {
  if (list.length) {
    console.log(`  [유형 ${t}] ${desc} — ${list.length}건`);
    list.slice(0, V_SAMPLE).forEach(v => console.log(`    - ${v}`));
    if (list.length > V_SAMPLE) console.log(`    … 외 ${list.length - V_SAMPLE}건`);
  }
  check(`불변식${{ a: 7, b: 8, c: 9, d: 10 }[t]}(${t}): ${desc} 0건`, list.length === 0, `${list.length}건`);
}

if (pageErrors.length) check('불변식0: JS 런타임 오류 없음', false, pageErrors.join(' | '));

let fail = 0;
console.log('══════════ audit.mjs — 불변식 감사 ══════════');
for (const r of results) {
  console.log(`${r.pass ? '[PASS]' : '[FAIL]'} ${r.name}`);
  if (!r.pass) { fail++; console.log('        → ' + r.info); }
}
console.log(`불변식 위반: ${fail}건`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
