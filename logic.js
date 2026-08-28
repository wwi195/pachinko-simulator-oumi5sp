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

const P_ODD = 0.54;

function rollPattern() {
  return Math.random() < P_ODD ? 'odd' : 'even';
}

const JITAN_SHORT = 100;
const JITAN_LONG = 200;

function decideJitanLength(cameFromJitanLike) {
  return cameFromJitanLike ? JITAN_LONG : JITAN_SHORT;
}

const YUUTAIMU_THRESHOLD = 950;
const YUUTAIMU_SPINS = 350;

function shouldEnterYuutaimu(lowProbSpinCount) {
  return lowProbSpinCount >= YUUTAIMU_THRESHOLD;
}

// 大当たり後の図柄振り分け。奇数=確変直行、偶数=時短
// （直前状態が時短/遊タイムなら200回転、それ以外は100回転）。
function resolvePattern(cameFromJitanLike) {
  const pattern = rollPattern();
  if (pattern === 'odd') {
    return { pattern, nextMode: 'rush' };
  }
  return { pattern, nextMode: 'jitan', jitanLength: decideJitanLength(cameFromJitanLike) };
}

// 通常時の1回転。ミスが続き低確率通算回転数が950に達したら遊タイムへ。
function applyNormalSpin(lowProbSpinCount) {
  const result = spinNormal();
  if (result === 'hit') {
    return { outcome: 'hit', lowProbSpinCount };
  }
  const nextCount = lowProbSpinCount + 1;
  if (shouldEnterYuutaimu(nextCount)) {
    return { outcome: 'yuutaimu_entry', lowProbSpinCount: nextCount };
  }
  return { outcome: 'miss', lowProbSpinCount: nextCount };
}

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
    P_ODD,
    rollPattern,
    JITAN_SHORT,
    JITAN_LONG,
    decideJitanLength,
    YUUTAIMU_THRESHOLD,
    YUUTAIMU_SPINS,
    shouldEnterYuutaimu,
    resolvePattern,
    applyNormalSpin,
  };
}
