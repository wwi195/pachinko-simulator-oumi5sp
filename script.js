'use strict';

const game = {
  state: 'normal_idle',
  mode: 'normal', // 'normal' | 'jitan' | 'rush' | 'yuutaimu'
  spinRate: DEFAULT_SPIN_RATE,
  mochiDama: 0,
  toushi: 0,
  totalSpins: 0,
  currentSpins: 0,
  lastHitSpins: 0,
  lowProbSpinCount: 0,
  jitanRemaining: 0,
  totalBonusHits: 0,
  initialHitCount: 0,
  rushEntryCount: 0,
  jitanEntryCount: 0,
  yuutaimuEntryCount: 0,
  rushAllStats: { rushTotalSpins: 0, rushTotalHits: 0 },
  sessionActive: false,
  session: null,
  pending: {},
  eigyoAlertShown: false,
  log: [],
};

function addLog(text, type = '') {
  game.log.unshift({ text, type });
  if (game.log.length > 50) game.log.pop();
  renderLog();
}

// ---- 球数・投資 ----

function consumeSpinCost() {
  const cost = calcSpinCost(game.spinRate);
  if (game.mochiDama >= cost) {
    game.mochiDama -= cost;
  } else {
    const shortfall = cost - game.mochiDama;
    game.mochiDama = 0;
    const units = Math.ceil(shortfall / 250);
    game.toushi   += units * 1000;
    game.mochiDama = units * 250 - shortfall;
  }
}

function addBalls(n) {
  game.mochiDama += n;
}

function handleSpinRateChange(value) {
  game.spinRate = Number(value);
  render();
}

// ---- 通常時ハンドラ ----

function checkEigyoAlert() {
  if (!game.eigyoAlertShown && game.totalSpins >= 2000) {
    game.eigyoAlertShown = true;
    setState('eigyo_alert');
    return true;
  }
  return false;
}

function runNormalSpin() {
  game.totalSpins++;
  game.currentSpins++;
  consumeSpinCost();
  const { outcome, lowProbSpinCount } = applyNormalSpin(game.lowProbSpinCount);
  game.lowProbSpinCount = lowProbSpinCount;

  if (outcome === 'hit') {
    resolveHit('normal');
    return true;
  }
  if (outcome === 'yuutaimu_entry') {
    enterYuutaimu();
    return true;
  }
  return false;
}

function handleStart() {
  if (checkEigyoAlert()) return;
  if (!runNormalSpin()) {
    setState('lose_result');
  }
}

function autoSpin(count) {
  for (let i = 0; i < count; i++) {
    if (checkEigyoAlert()) return;
    if (runNormalSpin()) return;
  }
  setState('normal_idle');
}
