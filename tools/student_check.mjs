// student_check.mjs — /학생점검 <이름>
// 해당 학생의 지원 카드 5장(4구간 각 1장 이상)을 골라
// 화면 표시값과 adiga.json 원본 행을 대조 출력한다. 코드 수정 없음, 읽기 전용.
// 실행: node tools/student_check.mjs <이름>
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name) { console.error('사용법: node tools/student_check.mjs <이름>'); process.exit(1); }

// excel_ingest.py의 canon()과 동일한 대학명 정규화 (원본 adiga 표기 → 빌드 표기)
const ALIAS = JSON.parse(readFileSync(join(TOOLS, 'univ_alias.json'), 'utf8'));
function canon(n) {
  if (n == null) return '';
  n = String(n).replace(/ /g, '').trim();
  if (!n) return '';
  if (ALIAS[n]) return ALIAS[n];
  let head = n, paren = '';
  const i = n.indexOf('(');
  if (i >= 0) { head = n.slice(0, i); paren = n.slice(i); }
  if (head.endsWith('대') && !head.endsWith('대학교')) head += '학교';
  return head + paren;
}

// 원본에 NaN 리터럴이 섞여 있어 (python json은 허용, JS는 불허) null로 치환 후 파싱
const adigaRaw = JSON.parse(readFileSync(join(TOOLS, 'adiga.json'), 'utf8').replace(/:\s*NaN/g, ': null'));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox']
});
const page = await browser.newPage();
await page.goto('file://' + join(TOOLS, '..', 'susi-counseling-2027.html'));
await page.waitForTimeout(1200);

const picked = await page.evaluate((name) => {
  const s = STUDENTS.find(x => x.name === name);
  if (!s) return { error: `학생 '${name}' 없음. 명단: ` + STUDENTS.map(x => x.name).join(', ') };
  const cards = buildApplicationCards(s).filter(c => !c.noCut);
  const out = [];
  // 4구간 각 1장 (신뢰도 높음 우선) + 남는 1장은 카드 수가 가장 많은 구간에서 추가
  const byBand = {};
  for (const b of ['안정', '적정', '소신', '상향']) {
    const pool = cards.filter(c => c.band === b)
      .sort((a, c) => (c.rel === '높음') - (a.rel === '높음'));
    byBand[b] = pool;
    if (pool[0]) out.push(pool[0]);
  }
  const biggest = Object.entries(byBand).sort((a, b) => b[1].length - a[1].length)[0];
  if (out.length < 5 && biggest && biggest[1][1]) out.push(biggest[1][1]);
  const f = c => ({ univ: c.univ, dept: c.dept, jn: c.jn, jt: c.jt, band: c.band, rel: c.rel,
                    g50: c.g50, g70: c.g70, score: c.score, stAvg: c.stAvg,
                    num: c.num, ratio: c.ratio, chu: c.chu });
  return { stAvg: cards[0] ? cards[0].stAvg : null, total: cards.length, cards: out.map(f) };
}, name);
await browser.close();

if (picked.error) { console.error(picked.error); process.exit(1); }

console.log(`════════ /학생점검 ${name} — 화면 카드 ↔ adiga.json 원본 대조 ════════`);
console.log(`전과목 평균등급(stAvg) ${picked.stAvg} · 컷 보유 카드 ${picked.total}장 중 ${picked.cards.length}장 표본 (구간별 1장 이상)\n`);

let mismatch = 0;
for (const c of picked.cards) {
  const rows = adigaRaw.filter(r =>
    canon(r['대학']) === c.univ && String(r['학과']) === c.dept && String(r['전형']) === c.jn);
  console.log(`[${c.band}·신뢰도 ${c.rel}] ${c.univ} ${c.dept} — ${c.jn} (${c.jt})`);
  console.log(`  화면: 등급50=${c.g50 ?? '-'} 등급70=${c.g70 ?? '-'} 모집=${c.num ?? '-'} 경쟁률=${c.ratio ?? '-'} 추합=${c.chu ?? '-'} | 학생 환산 ${c.score} (평균 ${c.stAvg})`);
  if (!rows.length) {
    console.log('  원본: ✗ 매칭 행 없음 (대학명 정규화 확인 필요)'); mismatch++; continue;
  }
  for (const r of rows) {
    const same = String(r['등급50'] ?? '') === String(c.g50 ?? '') && String(r['등급70'] ?? '') === String(c.g70 ?? '');
    if (!same) mismatch++;
    console.log(`  원본: 등급50=${r['등급50'] ?? '-'} 등급70=${r['등급70'] ?? '-'} 모집=${r['모집인원'] ?? '-'} 경쟁률=${r['경쟁률'] ?? '-'} 추합=${r['추합'] ?? '-'} → ${same ? '[일치]' : '[불일치!]'}`);
  }
  if (rows.length > 1) console.log(`  (원본 중복 ${rows.length}건 — 빌드는 등급 완전성→모집인원 순으로 1건 채택)`);
  console.log('');
}
console.log(mismatch === 0 ? '결론: 표본 전건 원본과 일치' : `결론: 불일치/미매칭 ${mismatch}건 — 원인 추적 필요`);
process.exit(mismatch === 0 ? 0 : 1);
