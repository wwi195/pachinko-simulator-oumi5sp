'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../logic.js');

function withMockRandom(values, fn) {
  const original = Math.random;
  let i = 0;
  Math.random = () => values[Math.min(i++, values.length - 1)];
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

test('SPIN_RATE_OPTIONS lists the four selectable rates with 16 as default', () => {
  assert.deepEqual(logic.SPIN_RATE_OPTIONS, [14, 16, 18, 20]);
  assert.equal(logic.DEFAULT_SPIN_RATE, 16);
});

test('calcSpinCost returns balls-per-spin for a given spins-per-1000-yen rate', () => {
  assert.equal(logic.calcSpinCost(16), 250 / 16);
  assert.equal(logic.calcSpinCost(14), 250 / 14);
  assert.equal(logic.calcSpinCost(18), 250 / 18);
  assert.equal(logic.calcSpinCost(20), 250 / 20);
});

test('P_NORMAL is 1/319.6 and P_RUSH is 1/31.9', () => {
  assert.equal(logic.P_NORMAL, 1 / 319.6);
  assert.equal(logic.P_RUSH, 1 / 31.9);
});

test('spinNormal returns hit when the draw beats P_NORMAL, miss otherwise', () => {
  assert.equal(withMockRandom([0], () => logic.spinNormal()), 'hit');
  assert.equal(withMockRandom([logic.P_NORMAL], () => logic.spinNormal()), 'miss');
  assert.equal(withMockRandom([0.99], () => logic.spinNormal()), 'miss');
});

test('spinRush returns hit when the draw beats P_RUSH, miss otherwise', () => {
  assert.equal(withMockRandom([0], () => logic.spinRush()), 'hit');
  assert.equal(withMockRandom([logic.P_RUSH], () => logic.spinRush()), 'miss');
  assert.equal(withMockRandom([0.99], () => logic.spinRush()), 'miss');
});

test('BONUS_NOMINAL is 1500 and BONUS_ACTUAL is 1400 (10R x 10カウント)', () => {
  assert.equal(logic.BONUS_NOMINAL, 1500);
  assert.equal(logic.BONUS_ACTUAL, 1400);
});

test('P_ODD is 0.54; rollPattern returns odd under 54%, even otherwise', () => {
  assert.equal(logic.P_ODD, 0.54);
  assert.equal(withMockRandom([0],          () => logic.rollPattern()), 'odd');
  assert.equal(withMockRandom([logic.P_ODD], () => logic.rollPattern()), 'even');
  assert.equal(withMockRandom([0.9],         () => logic.rollPattern()), 'even');
});

test('JITAN_SHORT is 100, JITAN_LONG is 200; decideJitanLength picks by origin', () => {
  assert.equal(logic.JITAN_SHORT, 100);
  assert.equal(logic.JITAN_LONG, 200);
  assert.equal(logic.decideJitanLength(false), 100);
  assert.equal(logic.decideJitanLength(true), 200);
});

test('YUUTAIMU_THRESHOLD is 950, YUUTAIMU_SPINS is 350; shouldEnterYuutaimu triggers at the threshold', () => {
  assert.equal(logic.YUUTAIMU_THRESHOLD, 950);
  assert.equal(logic.YUUTAIMU_SPINS, 350);
  assert.equal(logic.shouldEnterYuutaimu(949), false);
  assert.equal(logic.shouldEnterYuutaimu(950), true);
});

test('resolvePattern: odd draw routes to rush regardless of prior state', () => {
  assert.deepEqual(withMockRandom([0], () => logic.resolvePattern(false)), { pattern: 'odd', nextMode: 'rush' });
  assert.deepEqual(withMockRandom([0], () => logic.resolvePattern(true)),  { pattern: 'odd', nextMode: 'rush' });
});

test('resolvePattern: even draw routes to jitan, length depends on prior state', () => {
  assert.deepEqual(
    withMockRandom([0.9], () => logic.resolvePattern(false)),
    { pattern: 'even', nextMode: 'jitan', jitanLength: 100 }
  );
  assert.deepEqual(
    withMockRandom([0.9], () => logic.resolvePattern(true)),
    { pattern: 'even', nextMode: 'jitan', jitanLength: 200 }
  );
});

test('applyNormalSpin: a hit leaves lowProbSpinCount untouched', () => {
  const { outcome, lowProbSpinCount } = withMockRandom([0], () => logic.applyNormalSpin(300));
  assert.equal(outcome, 'hit');
  assert.equal(lowProbSpinCount, 300);
});

test('applyNormalSpin: a miss increments lowProbSpinCount and reports miss below threshold', () => {
  const { outcome, lowProbSpinCount } = withMockRandom([0.99], () => logic.applyNormalSpin(300));
  assert.equal(outcome, 'miss');
  assert.equal(lowProbSpinCount, 301);
});

test('applyNormalSpin: a miss that reaches 950 reports yuutaimu_entry', () => {
  const { outcome, lowProbSpinCount } = withMockRandom([0.99], () => logic.applyNormalSpin(949));
  assert.equal(outcome, 'yuutaimu_entry');
  assert.equal(lowProbSpinCount, 950);
});
