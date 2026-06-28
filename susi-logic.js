(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SusiLogic = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const THRESHOLD = 0.3;

  // ── 합격선 DB (사용자가 채울 틀) ─────────────────────────────
  // 합격선등급: 등급(1.0~9.0, 낮을수록 우수). 예) 50%컷.
  // 새 항목을 추가할 때 id는 고유해야 합니다.
  const 합격선DB = [
    {
      id: 'sample-1', 대학: '○○대학교', 학과: '컴퓨터공학과', 계열: '자연',
      전형유형: '학생부교과', 모집인원: 30, 합격선등급: 2.3,
      수능최저: '3개합 6', 비고: '예시 데이터 — 실제 값으로 교체',
    },
    {
      id: 'sample-2', 대학: '○○대학교', 학과: '경영학과', 계열: '인문',
      전형유형: '학생부종합', 모집인원: 40, 합격선등급: 2.8,
      수능최저: '', 비고: '예시 데이터 — 실제 값으로 교체',
    },
  ];

  function getCutoff(id) {
    return 합격선DB.find((r) => r.id === id) || null;
  }

  function filterCutoffs(opts = {}) {
    const { 계열, 전형유형 } = opts;
    return 합격선DB.filter(
      (r) => (!계열 || r.계열 === 계열) && (!전형유형 || r.전형유형 === 전형유형)
    );
  }

  // 등급은 낮을수록 우수. diff = 학생 - 합격선.
  function classify(studentGrade, cutoffGrade) {
    // 등급은 0.1 단위 → 부동소수점 잡음 제거 후 비교
    const diff = Math.round((studentGrade - cutoffGrade) * 1e9) / 1e9;
    if (diff <= -THRESHOLD) return '안정';
    if (diff <= THRESHOLD) return '적정';
    return '상향';
  }

  const RECOMMENDED = { 상향: 2, 적정: 2, 안정: 2 };

  function balanceSummary(slots) {
    const out = { 상향: 0, 적정: 0, 안정: 0, 배정: 0, 빈슬롯: 0 };
    for (const s of slots) {
      const c = s && s.분류;
      if (c === '상향' || c === '적정' || c === '안정') {
        out[c]++;
        out.배정++;
      } else {
        out.빈슬롯++;
      }
    }
    return out;
  }

  function makeStudent(이름, id) {
    return {
      id,
      이름,
      학년반: '',
      내신: { 전과목: null, 주요과목: null },
      모의: { 국: null, 수: null, 영: null, 탐1: null, 탐2: null },
      희망: { 계열: '', 관심학과: [] },
      지원: Array.from({ length: 6 }, (_, i) => ({
        slot: i + 1, 합격선id: '', 분류: '', 메모: '',
      })),
      상담: [],
    };
  }

  function serializeStudents(students) {
    return JSON.stringify(students, null, 2);
  }

  function deserializeStudents(text) {
    const data = JSON.parse(text); // 잘못된 JSON이면 여기서 throw
    if (!Array.isArray(data)) throw new Error('학생 데이터는 배열이어야 합니다.');
    return data;
  }

  return { THRESHOLD, classify, RECOMMENDED, balanceSummary, makeStudent, serializeStudents, deserializeStudents, 합격선DB, getCutoff, filterCutoffs };
});
