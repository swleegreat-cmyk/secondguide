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

  return { THRESHOLD, classify };
});
