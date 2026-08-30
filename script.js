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
  yuutaimuUsed: false,
  supportSpinsSinceLastHit: 0,
  normalBallsSpentSinceLastHit: 0,
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

function consumeBalls(cost) {
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

// 通常時の回転コスト（回転数レートから算出）。電サポ抜け後の使用玉数として集計する。
function consumeSpinCost() {
  const cost = calcSpinCost(game.spinRate);
  game.normalBallsSpentSinceLastHit += cost;
  consumeBalls(cost);
}

// 時短・確変・遊タイム中の回転コスト。電サポ中は玉が減りにくいため1回転1球固定。
function consumeSupportSpinCost() {
  game.supportSpinsSinceLastHit++;
  consumeBalls(1);
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
  if (!game.eigyoAlertShown && game.totalSpins >= 4000) {
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
  const { outcome, lowProbSpinCount } = applyNormalSpin(game.lowProbSpinCount, game.yuutaimuUsed);
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
  const spinsAfterSupport = interval - game.supportSpinsSinceLastHit;
  const normalBallsSpent = Math.floor(game.normalBallsSpentSinceLastHit);
  game.currentSpins = 0;
  game.lastHitSpins = game.totalSpins;
  game.lowProbSpinCount = 0;
  game.yuutaimuUsed = false; // 大当たりを引いたら青天井は解除、遊タイムの天井を再度有効にする
  game.supportSpinsSinceLastHit = 0;
  game.normalBallsSpentSinceLastHit = 0;

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
  const symbol = rollHitSymbol(result.pattern);

  if (result.nextMode === 'rush') {
    game.mode = 'rush';
    game.rushEntryCount++;
    game.session.rushCount++;
    game.pending = { pattern: 'odd', interval, symbol, spinsAfterSupport, normalBallsSpent };
  } else {
    game.mode = 'jitan';
    game.jitanRemaining = result.jitanLength;
    game.jitanEntryCount++;
    game.session.jitanCount++;
    game.pending = { pattern: 'even', interval, jitanLength: result.jitanLength, symbol, spinsAfterSupport, normalBallsSpent };
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
  game.yuutaimuUsed = true; // 次に大当たりを引くまでは青天井（同じ天井での再突入を防止）。
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
  consumeSupportSpinCost();
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

function runRushSpin() {
  game.totalSpins++;
  game.currentSpins++;
  game.rushAllStats.rushTotalSpins++;
  consumeSupportSpinCost();
  const { outcome } = applyRushSpin();

  if (outcome === 'hit') {
    game.rushAllStats.rushTotalHits++;
    resolveHit('rush');
    return true;
  }
  return false;
}

function handleRushSpin30() {
  for (let i = 0; i < 30; i++) {
    if (runRushSpin()) return;
  }
  setState('rush_idle');
}

// ---- 遊タイム中ハンドラ ----

function runYuutaimuSpin(opts = {}) {
  game.totalSpins++;
  game.currentSpins++;
  game.lowProbSpinCount++;
  consumeSupportSpinCost();
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
  game.yuutaimuUsed = false;
  game.supportSpinsSinceLastHit = 0;
  game.normalBallsSpentSinceLastHit = 0;
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
  renderLog();
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

  const supportLabelEl = document.getElementById('esup-label');
  const supportEl = document.getElementById('rush-count');
  if (game.mode === 'jitan' || game.mode === 'yuutaimu') {
    supportLabelEl.textContent = '電サポ残り';
    supportEl.textContent = `${game.jitanRemaining}回`;
  } else if (game.mode === 'rush') {
    supportLabelEl.textContent = '電サポ残り';
    supportEl.textContent = '次回まで';
  } else if (game.yuutaimuUsed) {
    supportLabelEl.textContent = '電サポ残り';
    supportEl.textContent = '－';
  } else {
    supportLabelEl.textContent = '遊タイムまで残り';
    supportEl.textContent = `${YUUTAIMU_THRESHOLD - game.lowProbSpinCount}回`;
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

function buildScreen(state) {
  switch (state) {

    case 'normal_idle':
      return `<div class="screen">
        <button class="btn-start" onclick="handleStart()">START</button>
        <p class="prob-hint">大当たり確率 1/319.6</p>
        <div class="spin-rate-block">
          <span class="spin-rate-label">1000円あたりの回転数</span>
          <select class="spin-rate-select" onchange="handleSpinRateChange(this.value)">
            ${spinRateOptionsHtml()}
          </select>
        </div>
        <div class="auto-spin-btns">
          <div class="auto-spin-wrap">
            <button class="btn-auto" onclick="autoSpin(${tenThousandYenSpins()})">1万円分</button>
            <p class="spin-cost-hint">約${tenThousandYenSpins()}回転分</p>
          </div>
        </div>
        <button class="btn-taiten" onclick="handleTaiten()">退店する</button>
      </div>`;

    case 'bonus_result': {
      const { interval, symbol, spinsAfterSupport, normalBallsSpent } = game.pending;
      // spinsAfterSupport===0 means every spin in this interval was under electric
      // support (the hit landed inside 時短/確変 itself) — showing "電サポ抜け後0回転"
      // there is meaningless, so show what was actually spent instead (1球/回転).
      const secondLine = spinsAfterSupport > 0
        ? `電サポ抜け後、${spinsAfterSupport}回転消化／使用玉数 -${normalBallsSpent.toLocaleString()}`
        : `消費玉数 -${(interval - spinsAfterSupport).toLocaleString()}`;
      return `<div class="screen">
        <p class="result-sub">${interval}回転で大当たり</p>
        <p class="result-sub">${secondLine}</p>
        <div class="vibun-box rush-box">
          <p class="bonus-main premium">${symbol}${symbol}${symbol}　大当たり</p>
          <p class="bonus-sub">${BONUS_NOMINAL}個（＋${BONUS_ACTUAL}球獲得）</p>
        </div>
        <button class="btn-action" onclick="handleBonusContinue()">▶ 次へ</button>
      </div>`;
    }

    case 'lose_result':
      return `<div class="screen">
        <p class="result-main lose">はずれ</p>
        <button class="btn-sub" onclick="setState('normal_idle')" style="margin-top:8px;">続ける</button>
      </div>`;

    case 'pattern_cutin': {
      const { pattern, jitanLength } = game.pending;
      const flavor = pattern === 'odd'
        ? '奇数図柄揃い！確変直行'
        : `偶数図柄揃い　時短${jitanLength}回転`;
      const title = pattern === 'odd' ? '確変突入！' : '時短突入';
      return `<div class="screen">
        <p class="cutin-flavor">${flavor}</p>
        <p class="rush-title">${title}</p>
        <button class="btn-action" onclick="handlePatternCutinContinue()">▶ 次へ</button>
      </div>`;
    }

    case 'jitan_idle': {
      return `<div class="screen">
        <p class="rush-sub">電サポ残り <span>${game.jitanRemaining}</span> 回</p>
        <div class="rush-spin-btns">
          <button class="btn-rush-spin" onclick="handleJitanSpin()">1回転</button>
          <button class="btn-rush-spin" onclick="handleJitanSpin10()">10回転</button>
          <button class="btn-rush-spin skip" onclick="handleJitanSkip()">スキップ</button>
        </div>
        <p class="prob-hint">大当たり確率 1/319.6</p>
        <button class="btn-taiten" onclick="handleTaiten()">退店する</button>
      </div>`;
    }

    case 'jitan_miss':
      return `<div class="screen">
        <p class="result-main lose">外れ</p>
        <p class="result-sub">電サポ残り ${game.jitanRemaining}回</p>
        <button class="btn-sub" onclick="handleJitanMissContinue()" style="margin-top:12px;">続ける</button>
      </div>`;

    case 'rush_idle':
      return `<div class="screen">
        <p class="chain-label">${game.session.hits}連チャン中</p>
        <p class="rush-sub">確変中獲得出玉 <span>${game.session.actualBalls.toLocaleString()}</span> 球</p>
        <div class="rush-spin-btns">
          <button class="btn-rush-spin" onclick="handleRushSpin30()">30回転</button>
        </div>
        <p class="prob-hint">大当たり確率 1/31.9</p>
        <button class="btn-taiten" onclick="handleTaiten()">退店する</button>
      </div>`;

    case 'yuutaimu_cutin':
      return `<div class="screen">
        <p class="cutin-flavor">低確率950回転消化</p>
        <p class="rush-title">遊タイム突入！</p>
        <p class="result-sub">1/319.6を950回転で引けない確率：${yuutaimuMissRatePercent()}%</p>
        <p class="result-sub">残り${YUUTAIMU_SPINS}回転</p>
        <button class="btn-action" onclick="handleYuutaimuCutinContinue()">▶ 次へ</button>
      </div>`;

    case 'yuutaimu_idle': {
      const skipDisabled = game.jitanRemaining <= 10;
      return `<div class="screen">
        <p class="rush-sub">遊タイム残り <span>${game.jitanRemaining}</span> 回</p>
        <div class="rush-spin-btns">
          <button class="btn-rush-spin" onclick="handleYuutaimuSpin()">1回転</button>
          <button class="btn-rush-spin" onclick="handleYuutaimuSpin10()">10回転</button>
          <button class="btn-rush-spin skip" ${skipDisabled ? 'disabled' : 'onclick="handleYuutaimuSkip()"'}>スキップ</button>
        </div>
        <p class="prob-hint">大当たり確率 1/319.6</p>
        <button class="btn-taiten" onclick="handleTaiten()">退店する</button>
      </div>`;
    }

    case 'yuutaimu_miss':
      return `<div class="screen">
        <p class="result-main lose">外れ</p>
        <p class="result-sub">遊タイム残り ${game.jitanRemaining}回</p>
        <button class="btn-sub" onclick="handleYuutaimuMissContinue()" style="margin-top:12px;">続ける</button>
      </div>`;

    case 'rush_session_result': {
      const s = game.session;
      return `<div class="screen">
        <p class="rush-result-title">RUSH リザルト</p>
        <div class="rush-result-box">
          <div class="result-row highlight">
            <span class="rr-label">連チャン数</span>
            <span class="rr-val gold">${s.hits}回</span>
          </div>
          <div class="result-row">
            <span class="rr-label">TOTAL</span>
            <span class="rr-val gold">${s.nominalBalls.toLocaleString()}個</span>
          </div>
          <div class="result-row">
            <span class="rr-label">獲得出玉</span>
            <span class="rr-val">${s.actualBalls.toLocaleString()}球</span>
          </div>
          <hr class="result-hr">
          <p class="rr-section">内訳</p>
          <div class="result-row">
            <span class="rr-label">確変移行</span>
            <span class="rr-val">×${s.rushCount}回</span>
          </div>
          <div class="result-row">
            <span class="rr-label">時短移行</span>
            <span class="rr-val">×${s.jitanCount}回</span>
          </div>
        </div>
        <button class="btn-action" onclick="handleSessionResultEnd()" style="margin-top:16px;">▶ 通常へ戻る</button>
      </div>`;
    }

    case 'eigyo_alert':
      return `<div class="screen">
        <p style="font-size:22px; font-weight:bold; color:#0d6ea8; text-align:center; line-height:1.6;">
          営業時間終了になりました
        </p>
        <p style="font-size:16px; color:#666; text-align:center;">このまま居座り続けますか？</p>
        <div style="display:flex; gap:16px; margin-top:8px;">
          <button class="btn-action" style="flex:1;" onclick="handleEigyoHai()">はい</button>
          <button class="btn-action" style="flex:1; background:linear-gradient(135deg,#999,#666); border-color:#ccc;"
            onclick="handleEigyoIie()">いいえ</button>
        </div>
      </div>`;

    case 'taiten_result': {
      const mochi    = Math.floor(game.mochiDama);
      const mochiYen = mochi * 4;
      const shuushi  = mochiYen - game.toushi;
      const shuushiColor = shuushi >= 0 ? '#2e9e5b' : '#d24141';
      const shuushiSign  = shuushi >= 0 ? '＋' : '';
      return `<div class="screen">
        <p style="font-size:24px; font-weight:bold; color:#666;">退店します</p>
        <div class="rush-result-box" style="max-width:320px;">
          <p class="rr-section" style="margin-bottom:8px;">収支発表</p>
          <div class="result-row">
            <span class="rr-label">総回転数</span>
            <span class="rr-val">${game.totalSpins.toLocaleString()}回</span>
          </div>
          <div class="result-row">
            <span class="rr-label">投資金額</span>
            <span class="rr-val" style="color:#d24141;">${game.toushi.toLocaleString()}円</span>
          </div>
          <div class="result-row">
            <span class="rr-label">持ち球換算</span>
            <span class="rr-val">${mochiYen.toLocaleString()}円</span>
          </div>
          <hr class="result-hr">
          <div class="result-row highlight">
            <span class="rr-label" style="font-weight:bold;">収支</span>
            <span class="rr-val" style="color:${shuushiColor}; font-size:22px;">
              ${shuushiSign}${shuushi.toLocaleString()}円
            </span>
          </div>
          <hr class="result-hr">
          <div class="result-row">
            <span class="rr-label">確変移行</span>
            <span class="rr-val">${game.rushEntryCount}回</span>
          </div>
        </div>
        <button class="btn-action" onclick="resetGame()" style="margin-top:8px;">▶ 最初の画面に戻る</button>
      </div>`;
    }

    default:
      return `<div class="screen"><p>...</p></div>`;
  }
}

render();
