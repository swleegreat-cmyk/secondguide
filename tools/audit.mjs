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
