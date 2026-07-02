// dict_scan.mjs — 신호 사전 개선 후보 스캔 (30분 루프용).
// 전체 학생 세특을 태깅 엔진으로 재분석해 사전이 놓친 패턴을 수집,
// dictionary_proposals.md에 누적 기록만 한다. 신호 사전 파일은 절대 수정하지 않는다.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SCRATCH = dirname(fileURLToPath(import.meta.url));
const MD = join(SCRATCH, 'dictionary_proposals.md');
const existing = existsSync(MD) ? readFileSync(MD, 'utf8') : '';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox']
});
const page = await browser.newPage();
await page.goto('file:///home/user/secondguide/susi-counseling-2027.html');
await page.waitForTimeout(1200);

const scan = await page.evaluate(() => {
  // 1) 구체성 '하'인데 고유명사·수치 의심 흔적이 있는 문장 (사전이 놓친 패턴)
  const missed = [];
  // 2) 신호가 전혀 없지만 반복 등장하는 명사 (주제 후보)
  const nounCount = {};
  for (const s of STUDENTS) {
    const tg = tagStudentRecords(s);
    for (const t of tg.all) {
      if (t.grade === '하' && !t.negated) {
        // 숫자, 영문 소문자 시작 고유명, 각종 괄호 표기 등 의심 흔적
        if (/\d/.test(t.text) || /[a-z]{4,}/.test(t.text) || /[<〈\[][^>〉\]]{2,20}[>〉\]]/.test(t.text)) {
          missed.push({ seat: s.seat, text: t.text.slice(0, 80) });
        }
      }
      const anySignal = Object.values(t.signals).some(Boolean);
      if (!anySignal) {
        for (let tok of (t.text.match(/[가-힣]{2,6}/g) || [])) {
          // 조사·어미 제거 (에서/으로/의/을/를 등) — 명사 후보만
          tok = tok.replace(/(에서|으로|이라|처럼|보다|만큼|까지|부터|에게|의|을|를|이|가|은|는|와|과|로|에|도|만)$/, '');
          if (tok.length < 2 || TOPIC_STOPWORDS.has(tok)) continue;
          nounCount[tok] = (nounCount[tok] || 0) + 1;
        }
      }
    }
  }
  const topicCands = Object.entries(nounCount).filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tok, n]) => ({ tok, n }));
  return { missed: missed.slice(0, 30), missedTotal: missed.length, topicCands };
});
await browser.close();

// 제안 후보 구성 (이미 기록된 패턴은 제외)
const proposals = [];
const seen = t => existing.includes(t);

// 놓친 패턴 유형별 그룹화
const numMissed = scan.missed.filter(m => /\d/.test(m.text));
const engMissed = scan.missed.filter(m => /[a-z]{4,}/.test(m.text));
const brMissed = scan.missed.filter(m => /[<〈\[]/.test(m.text));
if (numMissed.length && !seen('패턴후보: 단위 없는 수치')) {
  proposals.push({ 패턴: '단위 없는 수치 표현 (예: "2가지 방법", 순번 표기) — 정량 단위 목록 확장 검토',
    근거: numMissed[0].text, 영향: numMissed.length });
}
if (engMissed.length && !seen('패턴후보: 소문자 영문')) {
  proposals.push({ 패턴: '소문자 시작 영문 고유명 (예: python, arduino) — 고유 패턴에 소문자 허용 검토',
    근거: engMissed[0].text, 영향: engMissed.length });
}
if (brMissed.length && !seen('패턴후보: 홑화살괄호')) {
  proposals.push({ 패턴: '홑화살괄호·대괄호 표기 제목 <...>, [...] — 고유 패턴 추가 검토',
    근거: brMissed[0].text, 영향: brMissed.length });
}
for (const tc of scan.topicCands.slice(0, 5)) {
  const key = `주제후보: ${tc.tok}`;
  if (!seen(key)) proposals.push({ 패턴: key + ' (신호 미검출 문장에서 반복 등장 — 산출물/고유 명사 여부 검토)',
    근거: `무신호 문장 내 ${tc.n}회 등장`, 영향: tc.n });
}

if (!proposals.length) {
  console.log('제안 없음');
  process.exit(0);
}
const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
let md = existing;
if (!md) md = '# 신호 사전 개선 제안 (자동 수집 — 사전 파일은 수정하지 않음)\n';
md += `\n## ${now} 스캔 (구체성 하+의심 흔적 ${scan.missedTotal}건)\n`;
for (const p of proposals) {
  md += `- **${p.패턴}**\n  - 근거 문장: "${p.근거}"\n  - 추가 시 영향: 약 ${p.영향}건\n`;
}
writeFileSync(MD, md);
console.log(`제안 ${proposals.length}건 기록 → dictionary_proposals.md`);
proposals.forEach(p => console.log(`  - ${p.패턴} (영향 ~${p.영향}건)`));
