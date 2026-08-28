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
