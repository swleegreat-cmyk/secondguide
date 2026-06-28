(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SusiLogic = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const THRESHOLD = 0.3;

  // 등급은 낮을수록 우수. diff = 학생 - 합격선.
  function classify(studentGrade, cutoffGrade) {
    const diff = studentGrade - cutoffGrade;
    const eps = 1e-10;
    if (diff <= -THRESHOLD + eps) return '안정';
    if (diff <= THRESHOLD + eps) return '적정';
    return '상향';
  }

  return { THRESHOLD, classify };
});
