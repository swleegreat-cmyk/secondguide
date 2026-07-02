// gen_golden_cases.mjs — 내신 환산 골든 케이스 25건 생성
// NAESIN_RULES에서 환산 방식이 서로 다른 규칙 유형을 대표하는 대학 25개를 선정,
// 대학당 1개 샘플 성적을 채워 golden_cases.json으로 저장한다.
// 기대환산점수는 전부 null — 사람이 모집요강과 대조해 수동 검산 후 채워 넣는다.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SCRATCH = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = '/root/.claude/uploads/cc6e0e76-fdf5-5e55-a082-664e43b1081b/37d55662-naesin_engine___.js';

// 엔진을 그대로 로드 (NAESIN_RULES + computeScore)
const src = fs.readFileSync(ENGINE, 'utf8')
  .replace('const NAESIN_RULES', 'globalThis.NAESIN_RULES')
  .replace('function computeScore', 'globalThis.computeScore = function computeScore');
(0, eval)(src);

// ── 규칙 유형별 대표 대학 25개 (환산 방식 다양성 기준 선정) ──
// 자동계산 가능한 핸들러(단순/교과군별/복합/가산점/전과목 계열) 위주로 선정해
// 기대값을 채우면 computeScore와 즉시 대조 가능하게 한다.
const SELECTED = [
  // 단순 상위N 계열
  ['건양대학교', '단순 상위N — 반영과목수만 지정'],
  ['동국대학교', '단순 상위N — 수도권 상위권 교과'],
  ['안양대학교', '단순 상위N — 계열별 반영교과 상이'],
  ['평택대학교', '단순 상위N — 전형별 반영수 상이'],
  ['청운대학교', '학기별 상위N — 학기 단위 선택'],
  ['한남대학교', '계열별 상위N'],
  // 교과군별 상위N 계열
  ['가야대학교(김해)', '교과군별 상위N — 국영수 6 + 탐구 2'],
  ['안동대학교', '교과군별 상위N — 국립대형'],
  ['한림대학교', '교과군별 상위N — 학과별 교과군 상이'],
  ['계명대학교', '교과군별 상위N — 계열별 교과군 상이'],
  ['대전대학교', '교과군별 상위N — 전형별 상이'],
  ['한밭대학교', '교과군별 상위N — 국립산업대형'],
  ['김천대학교', '교과군별 상위N — 진로선택과목 대체 허용'],
  // 복합(공통선택 + 진로선택 별도) 계열
  ['남서울대학교', '공통선택 상위N + 진로선택 별도 반영'],
  ['백석대학교', '공통선택 상위N + 진로선택 별도 반영'],
  ['장로회신학대학교', '학년별 상위N — 학년마다 선택수 지정'],
  ['대전신학대학교', '학년별 상위N + 학년별 가중치'],
  ['루터대학교', '학년무관 상위N — 일반/진로 분리 선택'],
  // 전과목 + 가산점 계열
  ['경상국립대학교', '전과목 반영 + 진로선택 가산점(별도 공식)'],
  ['조선대학교', '전과목 반영 + 진로선택 가산점'],
  ['부산대학교', '전과목 단위수 가중평균'],
  ['숭실대학교', '전과목 단위수 가중평균'],
  ['경희대학교', '전과목 가중평균 — 상위권 종합대'],
  ['인하대학교', '공통·일반선택 전과목 + 진로선택 상위N'],
  ['아주대학교', '공통·일반선택 전과목 + 진로선택 상위N(변형)'],
];

// ── 샘플 입력 성적 (모든 케이스 공통 — 수동 검산 시 같은 성적표 1장으로 대조) ──
// 병점고 3-4 평균권 학생을 가정한 가상 성적. 교과별 등급/단위수, 진로선택(achievement) 포함.
const SAMPLE_SUBJECTS = [
  // 1학년
  { 학년: 1, 학기: 1, 교과: '국어', 과목명: '국어', grade: 3, achievement: null, unit: 4, is_career: false },
  { 학년: 1, 학기: 1, 교과: '수학', 과목명: '수학', grade: 4, achievement: null, unit: 4, is_career: false },
  { 학년: 1, 학기: 1, 교과: '영어', 과목명: '영어', grade: 3, achievement: null, unit: 4, is_career: false },
  { 학년: 1, 학기: 1, 교과: '사회', 과목명: '통합사회', grade: 2, achievement: null, unit: 3, is_career: false },
  { 학년: 1, 학기: 1, 교과: '과학', 과목명: '통합과학', grade: 4, achievement: null, unit: 3, is_career: false },
  { 학년: 1, 학기: 2, 교과: '국어', 과목명: '국어', grade: 2, achievement: null, unit: 4, is_career: false },
  { 학년: 1, 학기: 2, 교과: '수학', 과목명: '수학', grade: 4, achievement: null, unit: 4, is_career: false },
  { 학년: 1, 학기: 2, 교과: '영어', 과목명: '영어', grade: 3, achievement: null, unit: 4, is_career: false },
  { 학년: 1, 학기: 2, 교과: '한국사', 과목명: '한국사', grade: 3, achievement: null, unit: 3, is_career: false },
  // 2학년
  { 학년: 2, 학기: 1, 교과: '국어', 과목명: '문학', grade: 2, achievement: null, unit: 4, is_career: false },
  { 학년: 2, 학기: 1, 교과: '수학', 과목명: '수학Ⅰ', grade: 5, achievement: null, unit: 4, is_career: false },
  { 학년: 2, 학기: 1, 교과: '영어', 과목명: '영어Ⅰ', grade: 3, achievement: null, unit: 4, is_career: false },
  { 학년: 2, 학기: 1, 교과: '사회', 과목명: '생활과 윤리', grade: 2, achievement: null, unit: 3, is_career: false },
  { 학년: 2, 학기: 2, 교과: '국어', 과목명: '독서', grade: 3, achievement: null, unit: 4, is_career: false },
  { 학년: 2, 학기: 2, 교과: '수학', 과목명: '수학Ⅱ', grade: 4, achievement: null, unit: 4, is_career: false },
  { 학년: 2, 학기: 2, 교과: '영어', 과목명: '영어Ⅱ', grade: 2, achievement: null, unit: 4, is_career: false },
  { 학년: 2, 학기: 2, 교과: '사회', 과목명: '사회·문화', grade: 3, achievement: null, unit: 3, is_career: false },
  // 3학년 (진로선택 포함)
  { 학년: 3, 학기: 1, 교과: '국어', 과목명: '화법과 작문', grade: 3, achievement: null, unit: 4, is_career: false },
  { 학년: 3, 학기: 1, 교과: '수학', 과목명: '확률과 통계', grade: 4, achievement: null, unit: 3, is_career: false },
  { 학년: 3, 학기: 1, 교과: '영어', 과목명: '영어 독해와 작문', grade: 3, achievement: null, unit: 4, is_career: false },
  { 학년: 3, 학기: 1, 교과: '사회', 과목명: '사회문제 탐구', grade: null, achievement: 'A', unit: 3, is_career: true },
  { 학년: 3, 학기: 1, 교과: '과학', 과목명: '생활과 과학', grade: null, achievement: 'B', unit: 3, is_career: true },
];

// ── 검산근거 자동 요약 (반영교과 / 학년비율 / 계산식) ──
function summarizeReflect(rule) {
  const kind = rule.규칙_종류 || '';
  const r = rule.규칙;
  const parts = [];
  if (Array.isArray(r)) {
    for (const item of r) {
      if (item.교과군) {
        const g = Array.isArray(item.교과군) ? item.교과군.join('·') : item.교과군;
        parts.push(`${g} 중 ${item.선택수}${typeof item.선택수 === 'number' ? '과목' : ''}`);
      } else if (item.반영교과) {
        parts.push(`${Array.isArray(item.반영교과) ? item.반영교과.join('·') : item.반영교과}${item.선택수 ? ` 상위 ${item.선택수}` : ''}`);
      } else if (item.학년 != null) {
        parts.push(`${item.학년}학년 상위 ${item.선택수 ?? '?'}과목`);
      } else if (item.선택수 != null) {
        parts.push(`상위 ${item.선택수}과목`);
      }
    }
  } else if (r && typeof r === 'object') {
    if (r.반영교과) parts.push(`반영교과 ${Array.isArray(r.반영교과) ? r.반영교과.join('·') : r.반영교과}`);
    if (r.선택수 != null) parts.push(`상위 ${r.선택수}과목`);
    if (r.공통일반) parts.push(`공통·일반선택: ${typeof r.공통일반 === 'string' ? r.공통일반 : JSON.stringify(r.공통일반)}`);
    if (r.진로선택) parts.push(`진로선택: ${typeof r.진로선택 === 'string' ? r.진로선택 : JSON.stringify(r.진로선택)}`);
    if (!parts.length) parts.push(JSON.stringify(r).slice(0, 160));
  }
  if (rule.총반영과목수) parts.push(`총 ${rule.총반영과목수}과목`);
  if (!parts.length) parts.push(kind);
  return parts.join(' / ');
}

function formulaOf(rule) {
  const kind = rule.규칙_종류 || '';
  if (kind.startsWith('전과목') && !kind.includes('가산점') && !kind.includes('진로선택상위N'))
    return '반영과목 등급 × 단위수 합 ÷ 단위수 합 (단위수 가중평균)';
  if (kind.includes('가산점'))
    return '전과목 단위수 가중평균 (진로선택 가산점 공식은 별도 — 엔진은 미적용, reliability=medium)';
  if (kind.includes('공통선택') || kind.includes('학년별') || kind.includes('학년무관') || kind.includes('별도'))
    return '구간(공통선택/진로선택/학년)별로 상위N 선발 후 전체 선발과목 등급의 단순평균 (진로선택 A=1·B=3·C=5 환산)';
  return '반영교과에서 상위N 과목 선발 후 등급 단순평균 (단위수 미가중, 진로선택 A=1·B=3·C=5 환산)';
}

function gradeRatioOf(rule) {
  if (rule.학년비율) return typeof rule.학년비율 === 'string' ? rule.학년비율 : JSON.stringify(rule.학년비율);
  const kind = rule.규칙_종류 || '';
  if (kind.includes('학년별')) return '학년별 반영수 별도 지정 (규칙 참조)';
  return '학년비율 없음 (전 학년 동일 취급)';
}

// ── 케이스 생성 ──
const cases = [];
for (const [univ, note] of SELECTED) {
  const rule = NAESIN_RULES[univ];
  if (!rule) { console.error(`⚠ NAESIN_RULES에 없음: ${univ}`); continue; }
  // 엔진 스모크: 이 성적표로 실제 계산이 되는지 (기대값 기입 후 대조 가능 여부 확인용)
  const smoke = computeScore(SAMPLE_SUBJECTS, rule, { A: 1, B: 3, C: 5 });
  cases.push({
    대학명: univ,
    전형명: rule.전형 || '교과',
    입력성적: SAMPLE_SUBJECTS,
    기대환산점수: null,
    검산근거: [
      `[규칙유형] ${rule.규칙_종류}`,
      `[반영교과] ${summarizeReflect(rule)}`,
      `[학년비율] ${gradeRatioOf(rule)}`,
      `[계산식] ${formulaOf(rule)}`,
      rule.비고 ? `[비고] ${rule.비고}` : null,
      `[선정사유] ${note}`,
      `[엔진현재값(참고)] ${smoke.환산등급 == null ? '자동계산 불가(수동 검산 필수)' : smoke.환산등급.toFixed(3) + ' (reliability=' + smoke.reliability + ', 반영 ' + (smoke.반영과목수 ?? '?') + '과목)'} — 모집요강과 대조해 기대환산점수를 채우세요`,
    ].filter(Boolean).join('\n'),
  });
}

if (cases.length !== 25) {
  console.error(`케이스 수 불일치: ${cases.length} (25 필요)`);
  process.exit(1);
}
fs.writeFileSync(path.join(SCRATCH, 'golden_cases.json'), JSON.stringify(cases, null, 1), 'utf8');
console.log(`golden_cases.json 생성: ${cases.length}건`);
const kinds = new Set(cases.map(c => NAESIN_RULES[c.대학명].규칙_종류));
console.log(`커버된 규칙유형: ${kinds.size}종 → ${[...kinds].join(', ')}`);
const computable = cases.filter(c => c.검산근거.includes('reliability=high') || c.검산근거.includes('reliability=medium') || c.검산근거.includes('reliability=low')).length;
console.log(`엔진 자동계산 가능(참고값 있음): ${computable}/25`);
