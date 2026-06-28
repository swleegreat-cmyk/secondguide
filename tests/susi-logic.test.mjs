import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SusiLogic = require('../susi-logic.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  PASS', name); }
  catch (e) { fail++; console.log('  FAIL', name, '\n    ', e.message); }
}

test('THRESHOLD is 0.3', () => {
  assert.equal(SusiLogic.THRESHOLD, 0.3);
});

test('classify: 학생이 합격선보다 0.3 이상 우수 → 안정', () => {
  assert.equal(SusiLogic.classify(2.0, 2.3), '안정'); // diff -0.3
  assert.equal(SusiLogic.classify(1.5, 2.3), '안정');
});

test('classify: 합격선 ±0.3 이내 → 적정', () => {
  assert.equal(SusiLogic.classify(2.3, 2.3), '적정');
  assert.equal(SusiLogic.classify(2.5, 2.3), '적정'); // diff +0.2
});

test('classify: 학생이 합격선보다 0.3 초과 부족 → 상향', () => {
  assert.equal(SusiLogic.classify(2.7, 2.3), '상향'); // diff +0.4
});

test('classify: 합격선보다 정확히 0.3 부족(경계) → 적정', () => {
  assert.equal(SusiLogic.classify(2.6, 2.3), '적정'); // diff +0.3
});

test('RECOMMENDED is 2/2/2', () => {
  assert.deepEqual(SusiLogic.RECOMMENDED, { 상향: 2, 적정: 2, 안정: 2 });
});

test('balanceSummary: 분류별 개수와 빈슬롯 집계', () => {
  const slots = [
    { 분류: '상향' }, { 분류: '상향' },
    { 분류: '적정' }, { 분류: '안정' },
    {}, { 분류: '' },
  ];
  assert.deepEqual(SusiLogic.balanceSummary(slots), {
    상향: 2, 적정: 1, 안정: 1, 배정: 4, 빈슬롯: 2,
  });
});

test('balanceSummary: 빈 배열', () => {
  assert.deepEqual(SusiLogic.balanceSummary([]), {
    상향: 0, 적정: 0, 안정: 0, 배정: 0, 빈슬롯: 0,
  });
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
