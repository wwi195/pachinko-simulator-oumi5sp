'use strict';

const SPIN_RATE_OPTIONS = [14, 16, 18, 20];
const DEFAULT_SPIN_RATE = 16;

function calcSpinCost(spinRate) {
  return 250 / spinRate;
}

const P_NORMAL = 1 / 319.6;
const P_RUSH = 1 / 31.9;

function spinNormal() {
  return Math.random() < P_NORMAL ? 'hit' : 'miss';
}

function spinRush() {
  return Math.random() < P_RUSH ? 'hit' : 'miss';
}

const BONUS_NOMINAL = 1500;
const BONUS_ACTUAL = 1400;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SPIN_RATE_OPTIONS,
    DEFAULT_SPIN_RATE,
    calcSpinCost,
    P_NORMAL,
    P_RUSH,
    spinNormal,
    spinRush,
    BONUS_NOMINAL,
    BONUS_ACTUAL,
  };
}
