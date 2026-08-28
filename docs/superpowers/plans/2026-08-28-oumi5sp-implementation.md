# P大海物語5スペシャル シミュレーター Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pachinko-simulator-lycoris` のUIシェル・アーキテクチャを流用し、実機「P大海物語5スペシャル」のスペック（確変ループ1/31.9・時短100/200回転・遊タイム950/350回転）を忠実に再現した新規パチンコシミュレーターを実装する。

**Architecture:** `index.html`/`script.js`/`style.css`/`logic.js` の4分割構成（lycoris踏襲）。`logic.js` は純粋関数のみで確率・状態遷移を実装し node:test でユニットテストする。`script.js` はlycorisの `game` オブジェクト＋`setState`/`render`/`buildScreen` パターンを踏襲しつつ、通常/時短/確変/遊タイムの4状態に対応する画面・ハンドラを実装する。

**Tech Stack:** Vanilla JS（フレームワーク無し）、node:test（ユニットテスト）、静的HTML/CSS。

**設計書:** `docs/superpowers/specs/2026-08-28-oumi5sp-spec-design.md`

---

## 状態遷移サマリ（実装の前提として全タスク共通で参照する）

| 状態(`game.mode`) | 確率 | 電サポ | 終了条件 |
|---|---|---|---|
| `normal` | 1/319.6 | 無 | 大当たり、または低確率通算950回転で `yuutaimu` へ自動移行 |
| `jitan`（時短） | 1/319.6 | 有（残回転数カウントダウン、100 or 200） | 大当たり、または残回転数0で `normal` へ（低確率通算回転数は引き継ぐ） |
| `rush`（確変） | 1/31.9 | 有（次回まで無制限） | 大当たりのみ |
| `yuutaimu`（遊タイム） | 1/319.6 | 有（残回転数カウントダウン、350固定） | 大当たり、または残回転数0で `normal` へ（低確率通算回転数を0にリセット） |

大当たり後は毎回 `resolvePattern(cameFromJitanLike)` で奇数(54%→確変)/偶数(46%→時短、直前が時短/遊タイムなら200回転・それ以外は100回転)を判定する。全大当たり共通で1500個(表示)/1400球(実質)。

初当たり（`normal`または`yuutaimu`中の当たり）から時短が0回転で切れて`normal`に戻るまでを1つの「RUSHセッション」としてまとめ、連チャン数・獲得球数を集計する。

---

## Task 1: プロジェクト初期セットアップの確認・修正

**Files:**
- Modify: `package.json`
- Create: `.gitignore`（既に作成済みなら内容確認のみ）

- [ ] **Step 1: package.json の name フィールドを確認する**

現在の内容（lycorisからコピーしたまま）:
```json
{
  "name": "pachinko-simulator-lycoris",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "test": "node --test \"test/**/*.test.js\""
  }
}
```

- [ ] **Step 2: name を修正する**

`package.json` を以下に書き換える:
```json
{
  "name": "pachinko-simulator-oumi5sp",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "test": "node --test \"test/**/*.test.js\""
  }
}
```

- [ ] **Step 3: .gitignore の中身を確認する**

`node_modules/` などlycorisと同じ内容であることを確認する（差分があれば揃える必要はない、変更不要ならスキップ）。

- [ ] **Step 4: コミット**

```bash
git add package.json
git commit -m "chore: rename package to pachinko-simulator-oumi5sp"
```

---

## Task 2: logic.js — 基本定数とスピン関数（TDD）

**Files:**
- Create: `test/logic.test.js`
- Create: `logic.js`

- [ ] **Step 1: テストファイルを新規作成し、基本定数・スピン関数のテストを書く**

`test/logic.test.js`:
```javascript
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
  assert.equal(withMockRandom([0.99], () => logic.spinNormal()), 'miss');
});

test('spinRush returns hit when the draw beats P_RUSH, miss otherwise', () => {
  assert.equal(withMockRandom([0], () => logic.spinRush()), 'hit');
  assert.equal(withMockRandom([0.99], () => logic.spinRush()), 'miss');
});
```

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `npm test`
Expected: FAIL（`logic.js` が存在しない、または `Cannot find module '../logic.js'`）

- [ ] **Step 3: logic.js を新規作成し、最小実装を書く**

`logic.js`:
```javascript
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SPIN_RATE_OPTIONS,
    DEFAULT_SPIN_RATE,
    calcSpinCost,
    P_NORMAL,
    P_RUSH,
    spinNormal,
    spinRush,
  };
}
```

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `npm test`
Expected: PASS（5 tests passing）

- [ ] **Step 5: コミット**

```bash
git add logic.js test/logic.test.js
git commit -m "feat: add spin rate, normal/rush probability constants and spin functions"
```

---

## Task 3: logic.js — 払い出し定数

**Files:**
- Modify: `test/logic.test.js`
- Modify: `logic.js`

- [ ] **Step 1: 払い出し定数のテストを追加する**

`test/logic.test.js` の末尾に追記:
```javascript

test('BONUS_NOMINAL is 1500 and BONUS_ACTUAL is 1400 (10R x 10カウント)', () => {
  assert.equal(logic.BONUS_NOMINAL, 1500);
  assert.equal(logic.BONUS_ACTUAL, 1400);
});
```

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `npm test`
Expected: FAIL（`logic.BONUS_NOMINAL` は `undefined`）

- [ ] **Step 3: logic.js に定数を追加する**

`spinRush` 関数の直後、`if (typeof module...` の手前に追加:
```javascript

const BONUS_NOMINAL = 1500;
const BONUS_ACTUAL = 1400;
```

`module.exports` オブジェクトに `BONUS_NOMINAL,` と `BONUS_ACTUAL,` を追加する。

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `npm test`
Expected: PASS（6 tests passing）

- [ ] **Step 5: コミット**

```bash
git add logic.js test/logic.test.js
git commit -m "feat: add BONUS_NOMINAL/BONUS_ACTUAL payout constants"
```

---

## Task 4: logic.js — 図柄振り分け（奇数/偶数）と時短回転数の決定

**Files:**
- Modify: `test/logic.test.js`
- Modify: `logic.js`

- [ ] **Step 1: rollPattern と decideJitanLength のテストを追加する**

`test/logic.test.js` の末尾に追記:
```javascript

test('P_ODD is 0.54; rollPattern returns odd under 54%, even otherwise', () => {
  assert.equal(logic.P_ODD, 0.54);
  assert.equal(withMockRandom([0],   () => logic.rollPattern()), 'odd');
  assert.equal(withMockRandom([0.9], () => logic.rollPattern()), 'even');
});

test('JITAN_SHORT is 100, JITAN_LONG is 200; decideJitanLength picks by origin', () => {
  assert.equal(logic.JITAN_SHORT, 100);
  assert.equal(logic.JITAN_LONG, 200);
  assert.equal(logic.decideJitanLength(false), 100);
  assert.equal(logic.decideJitanLength(true), 200);
});
```

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `npm test`
Expected: FAIL（`logic.rollPattern is not a function`）

- [ ] **Step 3: logic.js に実装を追加する**

`BONUS_ACTUAL` 定義の直後に追加:
```javascript

const P_ODD = 0.54;

function rollPattern() {
  return Math.random() < P_ODD ? 'odd' : 'even';
}

const JITAN_SHORT = 100;
const JITAN_LONG = 200;

function decideJitanLength(cameFromJitanLike) {
  return cameFromJitanLike ? JITAN_LONG : JITAN_SHORT;
}
```

`module.exports` に `P_ODD, rollPattern, JITAN_SHORT, JITAN_LONG, decideJitanLength,` を追加する。

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `npm test`
Expected: PASS（8 tests passing）

- [ ] **Step 5: コミット**

```bash
git add logic.js test/logic.test.js
git commit -m "feat: add odd/even pattern roll and jitan length decision"
```

---

## Task 5: logic.js — 遊タイム閾値と resolvePattern

**Files:**
- Modify: `test/logic.test.js`
- Modify: `logic.js`

- [ ] **Step 1: YUUTAIMU定数・shouldEnterYuutaimu・resolvePattern のテストを追加する**

`test/logic.test.js` の末尾に追記:
```javascript

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
```

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `npm test`
Expected: FAIL（`logic.shouldEnterYuutaimu is not a function`）

- [ ] **Step 3: logic.js に実装を追加する**

`decideJitanLength` 定義の直後に追加:
```javascript

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
```

`module.exports` に `YUUTAIMU_THRESHOLD, YUUTAIMU_SPINS, shouldEnterYuutaimu, resolvePattern,` を追加する。

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `npm test`
Expected: PASS（11 tests passing）

- [ ] **Step 5: コミット**

```bash
git add logic.js test/logic.test.js
git commit -m "feat: add yuutaimu threshold and resolvePattern"
```

---

## Task 6: logic.js — 通常時スピンの状態遷移リデューサー

**Files:**
- Modify: `test/logic.test.js`
- Modify: `logic.js`

- [ ] **Step 1: applyNormalSpin のテストを追加する**

`test/logic.test.js` の末尾に追記:
```javascript

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
```

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `npm test`
Expected: FAIL（`logic.applyNormalSpin is not a function`）

- [ ] **Step 3: logic.js に実装を追加する**

`resolvePattern` の直後に追加:
```javascript

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
```

`module.exports` に `applyNormalSpin,` を追加する。

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `npm test`
Expected: PASS（14 tests passing）

- [ ] **Step 5: コミット**

```bash
git add logic.js test/logic.test.js
git commit -m "feat: add applyNormalSpin state reducer"
```

---

## Task 7: logic.js — 時短/遊タイム共通スピンリデューサーと確変スピンリデューサー

**Files:**
- Modify: `test/logic.test.js`
- Modify: `logic.js`

時短と遊タイムは「同じ確率(1/319.6)で残り回転数をカウントダウンし、0になったら終了を報告する」という点で全く同じ仕組みなので、`applySupportSpin` という1つの共通リデューサーとして実装する（呼び出し側の `script.js` が、終了時に「時短切れ→セッション終了」か「遊タイム切れ→通常へ」かを使い分ける）。

- [ ] **Step 1: applySupportSpin と applyRushSpin のテストを追加する**

`test/logic.test.js` の末尾に追記:
```javascript

test('applySupportSpin: a hit leaves remaining untouched', () => {
  const { outcome, remaining } = withMockRandom([0], () => logic.applySupportSpin(50));
  assert.equal(outcome, 'hit');
  assert.equal(remaining, 50);
});

test('applySupportSpin: a miss decrements remaining and reports miss above zero', () => {
  const { outcome, remaining } = withMockRandom([0.99], () => logic.applySupportSpin(50));
  assert.equal(outcome, 'miss');
  assert.equal(remaining, 49);
});

test('applySupportSpin: a miss on the last spin reports end', () => {
  const { outcome, remaining } = withMockRandom([0.99], () => logic.applySupportSpin(1));
  assert.equal(outcome, 'end');
  assert.equal(remaining, 0);
});

test('applyRushSpin: reports hit or miss with no extra state', () => {
  assert.deepEqual(withMockRandom([0], () => logic.applyRushSpin()), { outcome: 'hit' });
  assert.deepEqual(withMockRandom([0.99], () => logic.applyRushSpin()), { outcome: 'miss' });
});
```

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `npm test`
Expected: FAIL（`logic.applySupportSpin is not a function`）

- [ ] **Step 3: logic.js に実装を追加する**

`applyNormalSpin` の直後に追加:
```javascript

// 時短中・遊タイム中の1回転（両者とも1/319.6・残数カウントダウンで同一の仕組み）。
function applySupportSpin(remaining) {
  const result = spinNormal();
  if (result === 'hit') {
    return { outcome: 'hit', remaining };
  }
  const nextRemaining = remaining - 1;
  if (nextRemaining <= 0) {
    return { outcome: 'end', remaining: 0 };
  }
  return { outcome: 'miss', remaining: nextRemaining };
}

// 確変中の1回転。次回大当たりまで無制限に継続する。
function applyRushSpin() {
  const result = spinRush();
  return { outcome: result === 'hit' ? 'hit' : 'miss' };
}
```

`module.exports` に `applySupportSpin, applyRushSpin,` を追加する。

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `npm test`
Expected: PASS（18 tests passing）

- [ ] **Step 5: コミット**

```bash
git add logic.js test/logic.test.js
git commit -m "feat: add applySupportSpin and applyRushSpin state reducers"
```

---

## Task 8: logic.js の最終確認

**Files:**
- Read: `logic.js`

- [ ] **Step 1: logic.js 全体を読み、module.exports に全関数・全定数が含まれていることを確認する**

以下がすべて `module.exports` に含まれていること: `SPIN_RATE_OPTIONS`, `DEFAULT_SPIN_RATE`, `calcSpinCost`, `P_NORMAL`, `P_RUSH`, `spinNormal`, `spinRush`, `BONUS_NOMINAL`, `BONUS_ACTUAL`, `P_ODD`, `rollPattern`, `JITAN_SHORT`, `JITAN_LONG`, `decideJitanLength`, `YUUTAIMU_THRESHOLD`, `YUUTAIMU_SPINS`, `shouldEnterYuutaimu`, `resolvePattern`, `applyNormalSpin`, `applySupportSpin`, `applyRushSpin`

- [ ] **Step 2: 全テストを再実行する**

Run: `npm test`
Expected: PASS（18 tests passing、0 failing）

不足があれば Task 2〜7 の該当箇所を修正してから次に進む。

---

## Task 9: index.html の実装

**Files:**
- Create: `index.html`

- [ ] **Step 1: index.html を新規作成する**

`index.html`:
```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>パチンコシミュレーター（大海物語5スペシャル）</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">

    <div id="title-bar">パチンコ　大海物語5スペシャル</div>

    <div id="header">

      <div class="hrow hrow1">
        <div class="spins-block">
          <span class="spins-current" id="current-spins">0</span>
          <span class="spins-unit">回</span>
          <span class="spins-sep">／累計</span>
          <span class="spins-total" id="total-spins-disp">0</span>
          <span class="spins-unit">回</span>
        </div>
        <div id="mode-badge">通常時</div>
        <div class="esup-block">
          <div class="esup-label">電サポ残り</div>
          <div class="esup-value" id="rush-count">－</div>
        </div>
      </div>

      <div class="hrow hrow2">
        <div class="money-block">
          <span class="money-label">持ち球</span>
          <span class="money-value gold" id="mochi-dama">0</span>
          <span class="money-unit">球</span>
        </div>
        <div class="money-block">
          <span class="money-label">投資</span>
          <span class="money-value red" id="toushi-value">0</span>
          <span class="money-unit">円</span>
        </div>
        <div class="money-block">
          <span class="money-label">収支</span>
          <span class="money-value red" id="shuushi-value">0</span>
          <span class="money-unit">円</span>
        </div>
      </div>

      <div class="hrow hrow3">
        <div class="hrow3-header">
          <span class="hrow3-title">大当たり総回数</span>
          <span class="total-hit-block">
            <span class="total-hit-count" id="total-hit-count">0回</span>
          </span>
          <span class="fee-block" id="fee-block">16回転/千円</span>
        </div>
        <div class="hrow3-normal-line">
          <span class="hit-label2">初当たり</span>
          <span class="hit-count" id="normal-first-hit">0回</span>
          <span class="hit-prob" id="normal-first-prob">1/―</span>
        </div>
        <div class="hrow3-stats">
          <div class="hit-item">
            <span class="hit-label2">確変移行</span>
            <span class="hit-count" id="rush-entry-count">0回</span>
            <span class="rush-entry" id="rush-entry-info">(移行率 0%)</span>
          </div>
          <div class="hit-item">
            <span class="hit-label2">時短経由</span>
            <span class="hit-count" id="jitan-entry-count">0回</span>
          </div>
          <div class="hit-item">
            <span class="hit-label2">遊タイム突入</span>
            <span class="hit-count" id="yuutaimu-entry-count">0回</span>
          </div>
        </div>
      </div>

    </div><!-- /header -->

    <div id="main-screen"></div>

    <div id="rush-stats-bar">
      <div class="rsb-header">
        <span class="rsb-title">通算確変成績</span>
        <span class="rsb-item">
          <span class="rsb-label">大当たり</span>
          <span class="rsb-val" id="rs-chain">0回</span>
          <span class="rsb-prob" id="rs-prob">1/―</span>
        </span>
        <span class="rsb-item">
          <span class="rsb-label">総回転</span>
          <span class="rsb-val" id="rs-spins">0回</span>
        </span>
      </div>
    </div>

    <div id="log-area">
      <div id="log-title">履歴</div>
      <div id="log-list"></div>
    </div>

  </div>
  <script src="logic.js"></script>
  <script src="script.js"></script>
</body>
</html>
```

`hrow3-stats` は `flex-wrap: wrap` 済みなので `hit-item` を3つ並べても折り返して表示される（`style.css` の変更は不要）。

- [ ] **Step 2: コミット**

```bash
git add index.html
git commit -m "feat: add index.html shell (reuses lycoris UI structure, relabeled)"
```

---

## Task 10: style.css の実装（海・青系配色）

**Files:**
- Create: `style.css`

lycorisのピンク/赤系配色（`#e63950`系）を海・青系（`#0d6ea8`系）に置き換え、副アクセント色（`#d2694a`）をティール（`#0f8a99`）に置き換える。カットイン色演出（虹/赤/緑/青）のCSSクラスは今回使わないため削除する。金色(`#c9a227`)・緑(`#2e9e5b`)・赤(`#d24141`、収支のマイナス表示用)はそのまま流用する。

- [ ] **Step 1: style.css を新規作成する**

`style.css`:
```css
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

body {
  background: #f5f5f7;
  color: #222;
  font-family: 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif;
  max-width: 390px;
  margin: 0 auto;
  min-height: 100vh;
  overflow-x: hidden;
}

#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #ffffff;
}

/* タイトル */
#title-bar {
  background: linear-gradient(135deg, #d2ecff, #b8e0ff);
  border-bottom: 2px solid #0d6ea8;
  text-align: center;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: bold;
  color: #0a5085;
  letter-spacing: 1px;
}

/* ========== ヘッダー ========== */
#header {
  background: #ffffff;
  border-bottom: 2px solid #0d6ea8;
  position: sticky;
  top: 0;
  z-index: 10;
}

.hrow {
  display: flex;
  align-items: center;
  padding: 6px 12px;
}

.hrow1 {
  justify-content: space-between;
  border-bottom: 1px solid #eee;
}

.spins-block { display: flex; align-items: baseline; gap: 2px; }
.spins-current { font-size: 20px; font-weight: bold; color: #0d6ea8; }
.spins-total   { font-size: 16px; font-weight: bold; color: #666; }
.spins-unit    { font-size: 11px; color: #999; }
.spins-sep     { font-size: 11px; color: #aaa; margin: 0 3px; }

#mode-badge {
  font-size: 12px;
  font-weight: bold;
  padding: 5px 12px;
  border-radius: 20px;
  background: #f2f2f4;
  border: 1px solid #ddd;
  color: #666;
  transition: all 0.3s;
}
#mode-badge.jitan    { background: #e0f7fa; border-color: #26a6c9; color: #0d6a80; }
#mode-badge.rush     { background: #fff4d6; border-color: #c9a227; color: #8a6d16; }
#mode-badge.yuutaimu { background: #e6f9ec; border-color: #2e9e5b; color: #1f6b3d; }

.esup-block { text-align: right; min-width: 60px; }
.esup-label { font-size: 10px; color: #999; }
.esup-value { font-size: 18px; font-weight: bold; color: #0d6ea8; }

.hrow2 {
  justify-content: space-around;
  border-bottom: 1px solid #eee;
  padding: 5px 12px;
}

.money-block { display: flex; align-items: baseline; gap: 4px; }
.money-label { font-size: 10px; color: #999; }
.money-value { font-size: 19px; font-weight: bold; }
.money-value.gold  { color: #c9a227; }
.money-value.red   { color: #d24141; }
.money-value.green { color: #2e9e5b; }
.money-unit  { font-size: 11px; color: #999; }

.hrow3 {
  flex-direction: column;
  padding: 4px 12px 6px;
  gap: 3px;
}

.hrow3-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.hrow3-title {
  font-size: 11px;
  font-weight: bold;
  color: #666;
  letter-spacing: 0.5px;
}

.hrow3-normal-line {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 2px;
}

.hrow3-stats {
  display: flex;
  gap: 14px;
  width: 100%;
  flex-wrap: wrap;
}

.hit-item {
  display: flex;
  align-items: baseline;
  gap: 3px;
  flex-wrap: wrap;
}

.hit-label2 { font-size: 9px; color: #999; }
.hit-count  { font-size: 12px; font-weight: bold; color: #333; }
.hit-prob   { font-size: 9px; color: #aaa; }
.rush-entry { font-size: 9px; color: #0f8a99; }

.total-hit-block { display: flex; align-items: baseline; gap: 3px; }
.total-hit-count { font-size: 12px; font-weight: bold; color: #c9a227; }

.fee-block { font-size: 9px; color: #aaa; white-space: nowrap; }

/* ========== メイン画面 ========== */
#main-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 20px;
  min-height: 380px;
}

.screen {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  animation: fadeIn 0.25s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* STARTボタン */
.btn-start {
  width: 148px;
  height: 148px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #4fc3f7, #0d6ea8);
  border: 5px solid #d2ecff;
  font-size: 26px;
  font-weight: bold;
  color: #fff;
  letter-spacing: 2px;
  cursor: pointer;
  box-shadow: 0 0 24px rgba(13,110,168,0.25), 0 4px 12px rgba(0,0,0,0.12);
  transition: transform 0.1s, box-shadow 0.1s;
}
.btn-start:active { transform: scale(0.94); }

/* アクションボタン */
.btn-action {
  width: 100%;
  max-width: 300px;
  padding: 15px;
  border-radius: 12px;
  background: linear-gradient(135deg, #0d6ea8, #0a5085);
  border: 2px solid #a8d8ff;
  font-size: 17px;
  font-weight: bold;
  color: #fff;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transition: opacity 0.1s, transform 0.1s;
}
.btn-action:active { opacity: 0.8; transform: scale(0.97); }

/* サブボタン */
.btn-sub {
  font-size: 14px;
  color: #666;
  background: none;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 8px 20px;
  cursor: pointer;
}
.btn-sub:active { opacity: 0.7; }

/* 確率表示 */
.prob-hint { font-size: 11px; color: #999; }

/* 結果テキスト */
.result-main {
  font-size: 34px;
  font-weight: bold;
  letter-spacing: 2px;
}
.result-main.win    { color: #c9a227; }
.result-main.lose   { color: #aaa; }

.result-balls { font-size: 30px; font-weight: bold; color: #c9a227; }
.result-sub   { font-size: 14px; color: #999; }

/* RUSH(確変/時短/遊タイム) */
.rush-title {
  font-size: 22px;
  font-weight: bold;
  letter-spacing: 1px;
  line-height: 1.3;
  text-align: center;
  color: #c9a227;
}

.cutin-flavor {
  font-size: 15px;
  font-weight: bold;
  letter-spacing: 1px;
  margin-bottom: 4px;
  color: #0d6ea8;
}

.rush-sub { font-size: 16px; color: #666; }
.rush-sub span { font-size: 32px; font-weight: bold; color: #0f8a99; }

.chain-label {
  font-size: 15px;
  font-weight: bold;
  color: #0f8a99;
  letter-spacing: 1px;
}

/* 振り分けボックス */
.vibun-box {
  width: 100%;
  max-width: 300px;
  background: #fbfbfc;
  border-radius: 12px;
  border: 2px solid #eee;
  padding: 18px;
  text-align: center;
}
.vibun-box.rush-box   { border-color: #0d6ea8; background: #eef8ff; }

.bonus-main {
  font-size: 22px;
  font-weight: bold;
  letter-spacing: 1px;
  line-height: 1.2;
}
.bonus-main.premium  { color: #c9a227; }
.bonus-main.standard { color: #0f8a99; }

.bonus-sub { font-size: 13px; color: #888; margin-top: 5px; }

/* 一括回転 */
.spin-rate-block {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}
.spin-rate-label { font-size: 11px; color: #999; }
.spin-rate-select {
  background: #fff;
  color: #333;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
}

.auto-spin-btns { display: flex; gap: 12px; margin-top: 4px; }

.btn-auto {
  flex: 1;
  padding: 12px 0;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #ccc;
  font-size: 15px;
  font-weight: bold;
  color: #333;
  cursor: pointer;
  transition: background 0.1s, transform 0.1s;
  max-width: 200px;
}
.btn-auto:active { background: #f2f2f2; transform: scale(0.96); }

.auto-spin-wrap  { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.spin-cost-hint  { font-size: 9px; color: #aaa; }

.btn-taiten {
  font-size: 12px;
  color: #999;
  background: none;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 6px 18px;
  cursor: pointer;
  margin-top: 4px;
}
.btn-taiten:active { opacity: 0.7; }

/* RUSH中の3種回転ボタン */
.rush-spin-btns {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  width: 100%;
  max-width: 320px;
}
.btn-rush-spin {
  flex: 1;
  padding: 10px 0;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #ccc;
  font-size: 13px;
  font-weight: bold;
  color: #333;
  cursor: pointer;
  transition: background 0.1s, transform 0.1s;
}
.btn-rush-spin:active { background: #f2f2f2; transform: scale(0.96); }
.btn-rush-spin.skip {
  background: linear-gradient(135deg, #0d6ea8, #0a5085);
  border-color: #a8d8ff;
  color: #fff;
}
.btn-rush-spin:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.btn-rush-spin.skip:disabled {
  background: #eee;
  border-color: #ddd;
  color: #aaa;
}

/* ========== リザルト ========== */
.rush-result-title {
  font-size: 20px;
  font-weight: bold;
  color: #c9a227;
  letter-spacing: 2px;
  border-bottom: 1px solid #eee;
  padding-bottom: 8px;
  width: 100%;
  max-width: 300px;
  text-align: center;
}

.rush-result-box {
  width: 100%;
  max-width: 300px;
  background: #fbfbfc;
  border: 1px solid #eee;
  border-radius: 12px;
  padding: 14px 16px;
}

.result-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 0;
}
.result-row.highlight { background: rgba(201,162,39,0.08); border-radius: 6px; padding: 6px 4px; }

.rr-label { font-size: 13px; color: #888; }
.rr-val   { font-size: 15px; font-weight: bold; color: #333; }
.rr-val.gold { color: #c9a227; font-size: 18px; }

.result-hr { border: none; border-top: 1px solid #eee; margin: 8px 0; }

.rr-section {
  font-size: 10px;
  color: #999;
  letter-spacing: 1px;
  margin-bottom: 4px;
}

/* ========== 通算確変成績 ========== */
#rush-stats-bar {
  background: #fafafa;
  border-top: 1px solid #eee;
  border-bottom: 1px solid #eee;
  padding: 5px 12px;
  flex-shrink: 0;
}
.rsb-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 3px;
}
.rsb-title {
  font-size: 10px;
  font-weight: bold;
  color: #0f8a99;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
.rsb-item { display: flex; align-items: baseline; gap: 3px; }
.rsb-label { font-size: 9px; color: #999; }
.rsb-val   { font-size: 12px; font-weight: bold; color: #333; }
.rsb-prob  { font-size: 9px; color: #999; }

/* ========== ログ ========== */
#log-area {
  background: #fafafa;
  border-top: 1px solid #eee;
  max-height: 140px;
  overflow-y: auto;
  flex-shrink: 0;
}
#log-title { font-size: 10px; color: #aaa; padding: 5px 12px 2px; letter-spacing: 1px; }
.log-item {
  font-size: 12px;
  padding: 4px 12px;
  border-bottom: 1px solid #f0f0f0;
  color: #888;
}
.log-item.win   { color: #b5872a; }
.log-item.rush  { color: #0d6ea8; }
```

- [ ] **Step 2: コミット**

```bash
git add style.css
git commit -m "feat: add style.css with ocean/blue palette"
```

---

## Task 11: script.js — game状態オブジェクトと通常時ハンドラ

**Files:**
- Create: `script.js`

- [ ] **Step 1: script.js を新規作成し、game オブジェクトと通常時ハンドラまでを実装する**

`script.js`:
```javascript
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
```

- [ ] **Step 2: ブラウザ非依存の範囲で構文エラーがないことを確認する**

Run: `node --check script.js`
Expected: 何も出力されない（構文エラー無し）

- [ ] **Step 3: コミット**

```bash
git add script.js
git commit -m "feat: add game state object and normal-mode handlers"
```

---

## Task 12: script.js — 大当たり共通処理・図柄振り分け画面・遊タイム突入

**Files:**
- Modify: `script.js`

- [ ] **Step 1: resolveHit / 図柄振り分け画面 / 遊タイム突入の処理を追加する**

`autoSpin` 関数の直後に追加:
```javascript

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
```

- [ ] **Step 2: 構文チェック**

Run: `node --check script.js`
Expected: 何も出力されない

- [ ] **Step 3: コミット**

```bash
git add script.js
git commit -m "feat: add resolveHit, pattern cutin flow, and yuutaimu entry"
```

---

## Task 13: script.js — 時短中ハンドラとRUSHセッション終了

**Files:**
- Modify: `script.js`

- [ ] **Step 1: 時短中ハンドラを追加する**

`handleYuutaimuCutinContinue` 関数の直後に追加:
```javascript

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
```

- [ ] **Step 2: 構文チェック**

Run: `node --check script.js`
Expected: 何も出力されない

- [ ] **Step 3: コミット**

```bash
git add script.js
git commit -m "feat: add jitan handlers and RUSH session end"
```

---

## Task 14: script.js — 確変中ハンドラと遊タイム中ハンドラ

**Files:**
- Modify: `script.js`

- [ ] **Step 1: 確変中ハンドラを追加する**

`handleSessionResultEnd` 関数の直後に追加:
```javascript

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
```

- [ ] **Step 2: 遊タイム中ハンドラを追加する**

`handleRushMissContinue` 関数の直後に追加:
```javascript

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
```

- [ ] **Step 3: 構文チェック**

Run: `node --check script.js`
Expected: 何も出力されない

- [ ] **Step 4: コミット**

```bash
git add script.js
git commit -m "feat: add rush and yuutaimu spin handlers"
```

---

## Task 15: script.js — 営業終了・退店・リセット

**Files:**
- Modify: `script.js`

- [ ] **Step 1: 営業終了・退店・リセット処理を追加する**

`handleYuutaimuMissContinue` 関数の直後に追加:
```javascript

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
```

- [ ] **Step 2: 構文チェック**

Run: `node --check script.js`
Expected: 何も出力されない

- [ ] **Step 3: コミット**

```bash
git add script.js
git commit -m "feat: add eigyo/taiten/reset handlers"
```

---

## Task 16: script.js — レンダリング関数

**Files:**
- Modify: `script.js`

- [ ] **Step 1: setState・render・各種renderXxx関数を追加する**

`resetGame` 関数の直後に追加:
```javascript

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
```

- [ ] **Step 2: 構文チェック**

Run: `node --check script.js`
Expected: 何も出力されない

- [ ] **Step 3: コミット**

```bash
git add script.js
git commit -m "feat: add render functions"
```

---

## Task 17: script.js — buildScreen（全画面HTML）と起動処理

**Files:**
- Modify: `script.js`

- [ ] **Step 1: buildScreen 関数を追加する**

`renderLog` 関数の直後に追加:
```javascript

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

    case 'bonus_result':
      return `<div class="screen">
        <p class="result-sub">${game.pending.interval}回転で大当たり</p>
        <div class="vibun-box rush-box">
          <p class="bonus-main premium">10R大当たり</p>
          <p class="bonus-sub">${BONUS_NOMINAL}個（＋${BONUS_ACTUAL}球獲得）</p>
        </div>
        <button class="btn-action" onclick="handleBonusContinue()">▶ 次へ</button>
      </div>`;

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
      const skipDisabled = game.jitanRemaining <= 10;
      return `<div class="screen">
        <p class="rush-sub">電サポ残り <span>${game.jitanRemaining}</span> 回</p>
        <div class="rush-spin-btns">
          <button class="btn-rush-spin" onclick="handleJitanSpin()">1回転</button>
          <button class="btn-rush-spin" onclick="handleJitanSpin10()">10回転</button>
          <button class="btn-rush-spin skip" ${skipDisabled ? 'disabled' : 'onclick="handleJitanSkip()"'}>スキップ</button>
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
          <button class="btn-rush-spin" onclick="handleRushSpin()">1回転</button>
          <button class="btn-rush-spin" onclick="handleRushSpin10()">10回転</button>
        </div>
        <p class="prob-hint">大当たり確率 1/31.9</p>
        <button class="btn-taiten" onclick="handleTaiten()">退店する</button>
      </div>`;

    case 'rush_miss':
      return `<div class="screen">
        <p class="result-main lose">外れ</p>
        <p class="result-sub">確変継続中</p>
        <button class="btn-sub" onclick="handleRushMissContinue()" style="margin-top:12px;">続ける</button>
      </div>`;

    case 'yuutaimu_cutin':
      return `<div class="screen">
        <p class="cutin-flavor">低確率950回転消化</p>
        <p class="rush-title">遊タイム突入！</p>
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
```

- [ ] **Step 2: 構文チェック**

Run: `node --check script.js`
Expected: 何も出力されない

- [ ] **Step 3: コミット**

```bash
git add script.js
git commit -m "feat: add buildScreen with all game screens and initial render() call"
```

---

## Task 18: 動作確認とテスト最終チェック

**Files:**
- Read: `index.html`, `script.js`, `style.css`, `logic.js`

- [ ] **Step 1: 全ユニットテストを再実行する**

Run: `npm test`
Expected: PASS（18 tests passing、0 failing）

- [ ] **Step 2: ブラウザでindex.htmlを開き、以下を手動確認する**

1. `index.html` をブラウザで開く（file://でよい）
2. STARTボタンを何度か押し、はずれ画面→続ける、が正常にループすることを確認
3. 「1万円分」ボタンで一括回転が動作し、当たりが出たら `bonus_result` → `pattern_cutin` → `jitan_idle` または `rush_idle` に正しく遷移することを確認
4. `jitan_idle` で1回転/10回転/スキップボタンが動作し、電サポ残りが0になったら `rush_session_result` 画面が出て「通常へ戻る」で `normal_idle` に戻ることを確認
5. `rush_idle` で1回転/10回転ボタンが動作し、連チャン数・確変中獲得出玉が正しく積み上がることを確認
6. ヘッダーの「電サポ残り」表示が時短/確変/遊タイムそれぞれで正しい値（回転数 / 次回まで / －）になることを確認
7. モードバッジの色・文言（通常時/時短/確変/遊タイム）が切り替わることを確認
7b. ヘッダーの「確変移行」「時短経由」「遊タイム突入」の3つの回数表示が、実際の遷移に応じて正しくカウントアップすることを確認
8. 「退店する」→収支画面→「最初の画面に戻る」で resetGame() が正しく初期化することを確認

低確率通算950回転（遊タイム突入）は自然到達に時間がかかるため、ブラウザのdevtoolsコンソールで `game.lowProbSpinCount = 948; autoSpin(5);` のように直接操作して `yuutaimu_cutin` 画面への遷移を確認してもよい。

- [ ] **Step 3: 確認した内容を踏まえ、不具合があれば該当タスクに戻って修正する**

- [ ] **Step 4: 最終コミット（動作確認で修正が発生した場合のみ）**

```bash
git add -A
git commit -m "fix: address issues found during manual smoke test"
```

---

## Self-Review Notes（実装者向け参考情報）

- `game.jitanRemaining` は `jitan` モードと `yuutaimu` モードで共用のフィールドである（同時に両モードがアクティブになることはないため問題ない）。
- `game.pending.jitanLength` は `pattern==='odd'` の場合は存在しない（`undefined`）が、`pattern_cutin` 画面ではその分岐で参照しないため問題ない。
- `resolveHit(fromMode)` の `fromMode` は呼び出し元の状態（'normal'|'jitan'|'rush'|'yuutaimu'）をそのまま渡す。`cameFromJitanLike` の判定に使われ、時短の長さ（100 or 200）を左右する重要な引数なので、呼び出し箇所（Task 11〜14の4箇所: `runNormalSpin`→'normal', `runJitanSpin`→'jitan', `runRushSpin`→'rush', `runYuutaimuSpin`→'yuutaimu'）を変更する際は必ず対応する文字列を渡すこと。
