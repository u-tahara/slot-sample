import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPachinko, formatNumber } from '../script.js';

class MockClassList {
  constructor(element) {
    this.element = element;
    this._classes = new Set();
  }

  syncFromString(value) {
    this._classes = new Set((value ?? '').split(/\s+/).filter(Boolean));
  }

  _update() {
    this.element._className = Array.from(this._classes).join(' ');
  }

  add(...tokens) {
    tokens.forEach((token) => {
      if (token) {
        this._classes.add(token);
      }
    });
    this._update();
  }

  remove(...tokens) {
    tokens.forEach((token) => {
      this._classes.delete(token);
    });
    this._update();
  }

  contains(token) {
    return this._classes.has(token);
  }

  toString() {
    return this.element._className;
  }
}

class MockElement {
  constructor(id, doc) {
    this.id = id;
    this.ownerDocument = doc;
    this._children = [];
    this._className = '';
    this._classList = new MockClassList(this);
    this.style = {
      setProperty() {},
      removeProperty() {},
    };
    this.textContent = '';
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = value;
    this._classList.syncFromString(value);
  }

  get classList() {
    return this._classList;
  }

  get children() {
    return this._children;
  }

  get lastElementChild() {
    return this._children[this._children.length - 1] ?? null;
  }

  prepend(child) {
    child.parentNode = this;
    this._children.unshift(child);
  }

  appendChild(child) {
    child.parentNode = this;
    this._children.push(child);
  }

  removeChild(child) {
    const index = this._children.indexOf(child);
    if (index >= 0) {
      this._children.splice(index, 1);
      child.parentNode = null;
    }
  }

  set innerHTML(value) {
    if (value === '') {
      this._children.forEach((child) => {
        child.parentNode = null;
      });
      this._children = [];
      return;
    }
    throw new Error('MockElement.innerHTML only supports clearing content.');
  }

  addEventListener() {
    // Event listeners are attached in production but invoked directly in tests.
  }
}

class MockButton extends MockElement {
  constructor(id, doc) {
    super(id, doc);
    this.disabled = false;
    this.listeners = new Map();
  }

  addEventListener(event, handler) {
    this.listeners.set(event, handler);
  }

  click() {
    const handler = this.listeners.get('click');
    if (handler) {
      handler();
    }
  }
}

class MockDocument {
  constructor() {
    this.elements = new Map();
  }

  registerElement(id, element) {
    this.elements.set(id, element);
  }

  getElementById(id) {
    return this.elements.get(id) ?? null;
  }

  createElement(tagName) {
    return new MockElement(tagName, this);
  }
}

function createTestDocument({ initialCredits = 120 } = {}) {
  const doc = new MockDocument();
  const creditDisplay = new MockElement('credit-display', doc);
  const ballCountDisplay = new MockElement('ball-count', doc);
  const lastResultDisplay = new MockElement('last-result', doc);
  const eventLog = new MockElement('event-log', doc);
  const shootButton = new MockButton('shoot-button', doc);
  const resetButton = new MockButton('reset-button', doc);
  const board = new MockElement('pachinko-board', doc);
  const pocketRow = new MockElement('pocket-row', doc);
  const reelContainer = new MockElement('reel-container', doc);
  const reachDisplay = new MockElement('reach-indicator', doc);
  board.appendChild(pocketRow);

  doc.registerElement('credit-display', creditDisplay);
  doc.registerElement('ball-count', ballCountDisplay);
  doc.registerElement('last-result', lastResultDisplay);
  doc.registerElement('event-log', eventLog);
  doc.registerElement('shoot-button', shootButton);
  doc.registerElement('reset-button', resetButton);
  doc.registerElement('pachinko-board', board);
  doc.registerElement('pocket-row', pocketRow);
  doc.registerElement('reel-container', reelContainer);
  doc.registerElement('reach-indicator', reachDisplay);

  return {
    doc,
    elements: {
      creditDisplay,
      ballCountDisplay,
      lastResultDisplay,
      eventLog,
      shootButton,
      resetButton,
      board,
      pocketRow,
      reelContainer,
      reachDisplay,
    },
    initialCredits,
  };
}

function latestLogText(eventLog) {
  return eventLog.children[0]?.textContent ?? '';
}

const TEST_TIMESTAMP = () => new Date('2023-01-01T00:00:00Z');

function createSequenceRandomProvider(values) {
  let index = 0;
  return () => {
    const value = values[index] ?? values[values.length - 1] ?? 0;
    index += 1;
    return value;
  };
}

const SIMPLE_POCKETS = [
  {
    id: 'hit',
    label: 'ヒット',
    reward: 10,
    rushReward: 40,
    weight: 1,
    shift: '0px',
    midShift: '0px',
    earlyShift: '0px',
  },
  {
    id: 'miss',
    label: 'ハズレ',
    reward: 0,
    weight: 0,
    shift: '0px',
    midShift: '0px',
    earlyShift: '0px',
  },
];

function createTestConfig(overrides = {}) {
  return {
    initialCredits: 20,
    ballCost: 1,
    animationDuration: 0,
    spinDuration: 0,
    reelSpinDuration: 0,
    reachHoldDuration: 0,
    reachChance: 0,
    timestampProvider: TEST_TIMESTAMP,
    randomProvider: createSequenceRandomProvider([0, 0, 0.6]),
    hitRate: 0.5,
    rushRate: 0.25,
    rushRewardMultiplier: 4,
    pockets: SIMPLE_POCKETS,
    ...overrides,
  };
}

test('formatNumber pads values with leading zeros', () => {
  assert.equal(formatNumber(7), '007');
  assert.equal(formatNumber(42, 4), '0042');
});

test('mountPachinko initialises displays, pockets, and startup log', () => {
  const { doc, elements } = createTestDocument();
  const game = mountPachinko(
    doc,
    createTestConfig({ initialCredits: 50 })
  );

  assert.equal(elements.creditDisplay.textContent, '050');
  assert.equal(elements.ballCountDisplay.textContent, '000');
  assert.equal(elements.eventLog.children.length, 1);
  assert.ok(
    latestLogText(elements.eventLog).includes('パチンコ盤面を初期化しました。')
  );
  assert.equal(elements.pocketRow.children.length, SIMPLE_POCKETS.length);
  assert.ok(game);
});

test('handleShoot consumes credit, increments count, and grants reward when hit succeeds', () => {
  const { doc, elements } = createTestDocument();
  const game = mountPachinko(doc, createTestConfig());

  game.handleShoot();

  assert.equal(elements.creditDisplay.textContent, '029');
  assert.equal(elements.ballCountDisplay.textContent, '001');
  assert.ok(latestLogText(elements.eventLog).includes('ヒット'));
  assert.equal(elements.lastResultDisplay.textContent, 'ヒット / 当たり +10');
});

test('handleShoot blocks when credits are insufficient', () => {
  const { doc, elements } = createTestDocument({ initialCredits: 0 });
  const game = mountPachinko(
    doc,
    createTestConfig({ initialCredits: 0 })
  );

  game.handleShoot();

  assert.equal(elements.ballCountDisplay.textContent, '000');
  assert.ok(latestLogText(elements.eventLog).includes('クレジットが不足'));
});

test('handleReset restores the initial state and clears logs', () => {
  const { doc, elements } = createTestDocument();
  const game = mountPachinko(doc, createTestConfig());

  game.handleShoot();
  game.handleReset();

  assert.equal(elements.creditDisplay.textContent, '020');
  assert.equal(elements.ballCountDisplay.textContent, '000');
  assert.equal(elements.lastResultDisplay.textContent, '---');
  assert.equal(elements.eventLog.children.length, 1);
  assert.ok(latestLogText(elements.eventLog).includes('初期状態にリセットしました。'));
});

test('addLog trims the oldest entries when exceeding the limit', () => {
  const { doc, elements } = createTestDocument();
  const game = mountPachinko(
    doc,
    createTestConfig({ maxLogItems: 3 })
  );

  for (let i = 0; i < 5; i += 1) {
    game.addLog(`テストログ${i}`);
  }

  assert.equal(elements.eventLog.children.length, 3);
  const oldest = elements.eventLog.children.at(-1);
  assert.ok(oldest.textContent.includes('テストログ2'));
});

test('resolvePocketOutcome respects miss probability and rush wins', () => {
  const { doc } = createTestDocument();
  const randomProvider = createSequenceRandomProvider([0.95, 0.1, 0.1]);
  const game = mountPachinko(
    doc,
    createTestConfig({ randomProvider })
  );

  const missPocket = SIMPLE_POCKETS[1];
  const outcome = game.resolvePocketOutcome(missPocket);
  assert.deepEqual(outcome, { isWin: false, reward: 0, isRush: false });

  const hitPocket = SIMPLE_POCKETS[0];
  const losingOutcome = game.resolvePocketOutcome(hitPocket);
  assert.equal(losingOutcome.isWin, false);
  assert.equal(losingOutcome.reward, 0);
  assert.equal(losingOutcome.isRush, false);

  const rushOutcome = game.resolvePocketOutcome(hitPocket);
  assert.equal(rushOutcome.isWin, true);
  assert.equal(rushOutcome.isRush, true);
  assert.equal(rushOutcome.reward, hitPocket.rushReward);
});

test('handleShoot records rush wins in the log and last result', () => {
  const { doc, elements } = createTestDocument();
  const randomProvider = createSequenceRandomProvider([0, 0.01, 0.1]);
  const game = mountPachinko(
    doc,
    createTestConfig({ randomProvider, hitRate: 0.5, rushRate: 0.5 })
  );

  game.handleShoot();

  assert.ok(latestLogText(elements.eventLog).includes('RUSH'));
  assert.equal(elements.lastResultDisplay.textContent, 'ヒット / RUSH +40');
  assert.equal(game.lastOutcome?.isRush, true);
});

test('buildReelSequence aligns reach trigger with the configured random source', () => {
  const { doc } = createTestDocument();
  const randomProvider = createSequenceRandomProvider([0, 0.5, 0.8, 0]);
  const game = mountPachinko(
    doc,
    createTestConfig({
      randomProvider,
      reachChance: 1,
      reelSymbols: ['A', 'B', 'C'],
    })
  );

  const sequence = game.buildReelSequence({ isWin: false });

  assert.deepEqual(sequence, [
    { symbol: 'A' },
    { symbol: 'A', triggerReach: true },
    { symbol: 'C', isFinal: true },
  ]);
});

test('playReelSequence updates reels sequentially and exposes reach indicator', async () => {
  const { doc, elements } = createTestDocument();
  const game = mountPachinko(
    doc,
    createTestConfig({ reelSpinDuration: 0, reachHoldDuration: 0 })
  );

  const sequence = [
    { symbol: 'X' },
    { symbol: 'X', triggerReach: true, reachText: 'チャンス！' },
    { symbol: 'Y', isFinal: true },
  ];
  game.buildReelSequence = () => sequence;

  game.playReelSequence({ isWin: false });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(game.reels[0].symbol.textContent, 'X');
  assert.equal(game.reels[1].symbol.textContent, 'X');
  assert.equal(game.reels[2].symbol.textContent, 'Y');
  assert.equal(elements.reachDisplay.textContent, 'チャンス！');
  assert.equal(elements.reachDisplay.classList.contains('is-visible'), true);
});

test('playReelSequence marks all reels during rush wins', async () => {
  const { doc } = createTestDocument();
  const game = mountPachinko(
    doc,
    createTestConfig({ reelSpinDuration: 0, reachHoldDuration: 0 })
  );

  const sequence = [
    { symbol: 'RUSH' },
    { symbol: 'RUSH' },
    { symbol: 'RUSH', isFinal: true },
  ];
  game.buildReelSequence = () => sequence;

  game.playReelSequence({ isWin: true, isRush: true });

  await new Promise((resolve) => setImmediate(resolve));

  game.reels.forEach(({ reel }) => {
    assert.equal(reel.classList.contains('is-rush'), true);
    assert.equal(reel.classList.contains('is-win'), false);
  });
});
