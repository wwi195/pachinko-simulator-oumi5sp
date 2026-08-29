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

// ---- 状態セット & レンダリング ----

function setState(state) {
  game.state = state;
  render();
}

function render() {
  renderHeader();
  renderModeBadge();
  renderMainScreen();
  renderRushStats();
}

function renderHeader() {
  const mochiInt = Math.floor(game.mochiDama);
  document.getElementById('mochi-dama').textContent   = mochiInt.toLocaleString();
  document.getElementById('toushi-value').textContent = game.toushi.toLocaleString();

  const shuushi   = mochiInt * 4 - game.toushi;
  const shuushiEl = document.getElementById('shuushi-value');
  shuushiEl.textContent = (shuushi >= 0 ? '+' : '') + shuushi.toLocaleString();
  shuushiEl.className   = 'money-value ' + (shuushi >= 0 ? 'green' : 'red');
  document.getElementById('current-spins').textContent = game.currentSpins.toLocaleString();
  document.getElementById('total-spins-disp').textContent = game.totalSpins.toLocaleString();

  const supportEl = document.getElementById('rush-count');
  if (game.mode === 'jitan' || game.mode === 'yuutaimu') {
    supportEl.textContent = `${game.jitanRemaining}回`;
  } else if (game.mode === 'rush') {
    supportEl.textContent = '次回まで';
  } else {
    supportEl.textContent = '－';
  }

  document.getElementById('total-hit-count').textContent = game.totalBonusHits + '回';
  document.getElementById('normal-first-hit').textContent  = game.initialHitCount + '回';
  document.getElementById('normal-first-prob').textContent = game.initialHitCount > 0 && game.totalSpins > 0
    ? '1/' + Math.round(game.totalSpins / game.initialHitCount).toLocaleString()
    : '1/―';

  document.getElementById('rush-entry-count').textContent = game.rushEntryCount + '回';
  const rushEntryRate = game.totalBonusHits > 0 ? Math.round(game.rushEntryCount / game.totalBonusHits * 100) : 0;
  document.getElementById('rush-entry-info').textContent = `(移行率 ${rushEntryRate}%)`;

  document.getElementById('jitan-entry-count').textContent = game.jitanEntryCount + '回';
  document.getElementById('yuutaimu-entry-count').textContent = game.yuutaimuEntryCount + '回';

  document.getElementById('fee-block').textContent = `${game.spinRate}回転/千円`;
}

const MODE_BADGE_LABELS = { normal: '通常時', jitan: '時短', rush: '確変', yuutaimu: '遊タイム' };

function renderModeBadge() {
  const el = document.getElementById('mode-badge');
  el.textContent = MODE_BADGE_LABELS[game.mode];
  el.className = game.mode === 'normal' ? '' : game.mode;
}

function renderMainScreen() {
  document.getElementById('main-screen').innerHTML = buildScreen(game.state);
}

function spinRateOptionsHtml() {
  return SPIN_RATE_OPTIONS.map(rate =>
    `<option value="${rate}" ${rate === game.spinRate ? 'selected' : ''}>${rate}回転</option>`
  ).join('');
}

function tenThousandYenSpins() {
  return game.spinRate * 10;
}

function renderRushStats() {
  const hits  = game.rushAllStats.rushTotalHits;
  const spins = game.rushAllStats.rushTotalSpins;
  const prob  = hits > 0 && spins > 0
    ? '1/' + (spins / hits).toFixed(1)
    : '1/―';
  document.getElementById('rs-chain').textContent = hits + '回';
  document.getElementById('rs-prob').textContent  = prob;
  document.getElementById('rs-spins').textContent = spins + '回';
}

function renderLog() {
  const el = document.getElementById('log-list');
  el.innerHTML = game.log.map(item =>
    `<div class="log-item ${item.type}">${item.text}</div>`
  ).join('');
}
