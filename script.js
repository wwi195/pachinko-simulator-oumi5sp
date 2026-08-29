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

// ---- 大当たり共通処理 ----

// fromMode: この当たりが発生した時点の game.mode ('normal'|'jitan'|'rush'|'yuutaimu')
function resolveHit(fromMode) {
  game.totalBonusHits++;
  addBalls(BONUS_ACTUAL);
  const interval = game.totalSpins - game.lastHitSpins;
  game.currentSpins = 0;
  game.lastHitSpins = game.totalSpins;
  game.lowProbSpinCount = 0;

  if (!game.sessionActive) {
    game.sessionActive = true;
    game.session = { hits: 0, nominalBalls: 0, actualBalls: 0, rushCount: 0, jitanCount: 0 };
    game.initialHitCount++;
  }
  game.session.hits++;
  game.session.nominalBalls += BONUS_NOMINAL;
  game.session.actualBalls += BONUS_ACTUAL;

  const cameFromJitanLike = fromMode === 'jitan' || fromMode === 'yuutaimu';
  const result = resolvePattern(cameFromJitanLike);

  if (result.nextMode === 'rush') {
    game.mode = 'rush';
    game.rushEntryCount++;
    game.session.rushCount++;
    game.pending = { pattern: 'odd', interval };
  } else {
    game.mode = 'jitan';
    game.jitanRemaining = result.jitanLength;
    game.jitanEntryCount++;
    game.session.jitanCount++;
    game.pending = { pattern: 'even', interval, jitanLength: result.jitanLength };
  }

  addLog(`${interval}回転で大当たり！ ＋${BONUS_ACTUAL}球`, 'win');
  setState('bonus_result');
}

function handleBonusContinue() {
  setState('pattern_cutin');
}

function handlePatternCutinContinue() {
  setState(game.mode === 'rush' ? 'rush_idle' : 'jitan_idle');
}

// ---- 遊タイム突入 ----

function enterYuutaimu() {
  game.mode = 'yuutaimu';
  game.jitanRemaining = YUUTAIMU_SPINS;
  game.yuutaimuEntryCount++;
  addLog('低確率950回転消化 → 遊タイム突入！', 'rush');
  setState('yuutaimu_cutin');
}

function handleYuutaimuCutinContinue() {
  setState('yuutaimu_idle');
}

// ---- 時短中ハンドラ ----

function runJitanSpin(opts = {}) {
  game.totalSpins++;
  game.currentSpins++;
  game.lowProbSpinCount++;
  consumeSpinCost();
  const { outcome, remaining } = applySupportSpin(game.jitanRemaining);
  game.jitanRemaining = remaining;

  if (outcome === 'hit') {
    resolveHit('jitan');
    return true;
  }
  if (outcome === 'end') {
    endSession();
    return true;
  }
  if (!opts.silent) {
    addLog(`電サポ残り${remaining}回`);
    setState('jitan_miss');
    return true;
  }
  return false;
}

function handleJitanSpin() {
  runJitanSpin();
}

function handleJitanSpin10() {
  for (let i = 0; i < 10; i++) {
    if (runJitanSpin({ silent: true })) return;
  }
  setState('jitan_idle');
}

function handleJitanSkip() {
  for (;;) {
    if (runJitanSpin({ silent: true })) return;
    if (game.jitanRemaining <= 10) {
      setState('jitan_idle');
      return;
    }
  }
}

function handleJitanMissContinue() {
  setState('jitan_idle');
}

function endSession() {
  game.mode = 'normal';
  addLog(`RUSHセッション終了（連チャン${game.session.hits}回） → 通常時へ`, 'rush');
  setState('rush_session_result');
}

function handleSessionResultEnd() {
  game.sessionActive = false;
  game.session = null;
  setState('normal_idle');
}

// ---- 確変中ハンドラ ----

function runRushSpin(opts = {}) {
  game.totalSpins++;
  game.currentSpins++;
  game.rushAllStats.rushTotalSpins++;
  consumeSpinCost();
  const { outcome } = applyRushSpin();

  if (outcome === 'hit') {
    game.rushAllStats.rushTotalHits++;
    resolveHit('rush');
    return true;
  }
  if (!opts.silent) {
    setState('rush_miss');
    return true;
  }
  return false;
}

function handleRushSpin() {
  runRushSpin();
}

function handleRushSpin10() {
  for (let i = 0; i < 10; i++) {
    if (runRushSpin({ silent: true })) return;
  }
  setState('rush_idle');
}

function handleRushMissContinue() {
  setState('rush_idle');
}

// ---- 遊タイム中ハンドラ ----

function runYuutaimuSpin(opts = {}) {
  game.totalSpins++;
  game.currentSpins++;
  game.lowProbSpinCount++;
  consumeSpinCost();
  const { outcome, remaining } = applySupportSpin(game.jitanRemaining);
  game.jitanRemaining = remaining;

  if (outcome === 'hit') {
    resolveHit('yuutaimu');
    return true;
  }
  if (outcome === 'end') {
    game.mode = 'normal';
    game.lowProbSpinCount = 0;
    addLog('遊タイム終了 → 通常時へ');
    setState('normal_idle');
    return true;
  }
  if (!opts.silent) {
    addLog(`遊タイム残り${remaining}回`);
    setState('yuutaimu_miss');
    return true;
  }
  return false;
}

function handleYuutaimuSpin() {
  runYuutaimuSpin();
}

function handleYuutaimuSpin10() {
  for (let i = 0; i < 10; i++) {
    if (runYuutaimuSpin({ silent: true })) return;
  }
  setState('yuutaimu_idle');
}

function handleYuutaimuSkip() {
  for (;;) {
    if (runYuutaimuSpin({ silent: true })) return;
    if (game.jitanRemaining <= 10) {
      setState('yuutaimu_idle');
      return;
    }
  }
}

function handleYuutaimuMissContinue() {
  setState('yuutaimu_idle');
}

// ---- 営業終了・退店 ----

const IDLE_STATE_BY_MODE = {
  normal: 'normal_idle',
  jitan: 'jitan_idle',
  rush: 'rush_idle',
  yuutaimu: 'yuutaimu_idle',
};

function handleEigyoHai() {
  setState(IDLE_STATE_BY_MODE[game.mode]);
}

function handleEigyoIie() {
  setState('taiten_result');
}

function handleTaiten() {
  setState('taiten_result');
}

function resetGame() {
  game.state = 'normal_idle';
  game.mode = 'normal';
  game.spinRate = DEFAULT_SPIN_RATE;
  game.mochiDama = 0;
  game.toushi = 0;
  game.totalSpins = 0;
  game.currentSpins = 0;
  game.lastHitSpins = 0;
  game.lowProbSpinCount = 0;
  game.jitanRemaining = 0;
  game.totalBonusHits = 0;
  game.initialHitCount = 0;
  game.rushEntryCount = 0;
  game.jitanEntryCount = 0;
  game.yuutaimuEntryCount = 0;
  game.rushAllStats = { rushTotalSpins: 0, rushTotalHits: 0 };
  game.sessionActive = false;
  game.session = null;
  game.pending = {};
  game.eigyoAlertShown = false;
  game.log = [];
  render();
}
