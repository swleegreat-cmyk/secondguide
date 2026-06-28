(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SusiLogic = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const THRESHOLD = 0.3;

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

  return { THRESHOLD, classify, RECOMMENDED, balanceSummary, makeStudent, serializeStudents, deserializeStudents };
});
