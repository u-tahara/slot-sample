import test from 'node:test';
import assert from 'node:assert/strict';
import { mountSlotMachine, formatNumber } from '../script.js';

class MockElement {
  constructor(id, doc) {
    this.id = id;
    this.ownerDocument = doc;
    this.textContent = '';
    this._children = [];
    this.className = '';
  }

  get children() {
    return this._children;
  }

  get lastElementChild() {
    return this._children[this._children.length - 1] ?? null;
  }

  prepend(child) {
    this._children.unshift(child);
  }

  appendChild(child) {
    this._children.push(child);
  }

  removeChild(child) {
    const index = this._children.indexOf(child);
    if (index >= 0) {
      this._children.splice(index, 1);
    }
  }

  set innerHTML(value) {
    if (value === '') {
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

function createTestDocument({ initialCredits = 50 } = {}) {
  const doc = new MockDocument();
  const creditDisplay = new MockElement('credit-display', doc);
  const betDisplay = new MockElement('bet-display', doc);
  const eventLog = new MockElement('event-log', doc);
  const betButton = new MockButton('bet-button', doc);
  const spinButton = new MockButton('spin-button', doc);
  const resetButton = new MockButton('reset-button', doc);
  const reelWindows = [1, 2, 3].map((index) => {
    const reelWindow = new MockElement(`reel-${index}-window`, doc);
    for (let i = 0; i < 3; i += 1) {
      reelWindow.appendChild(new MockElement(`symbol-${index}-${i}`, doc));
    }
    return reelWindow;
  });
  const stopButtons = [1, 2, 3].map(
    (index) => new MockButton(`stop-button-${index}`, doc)
  );

  doc.registerElement('credit-display', creditDisplay);
  doc.registerElement('bet-display', betDisplay);
  doc.registerElement('event-log', eventLog);
  doc.registerElement('bet-button', betButton);
  doc.registerElement('spin-button', spinButton);
  doc.registerElement('reset-button', resetButton);
  reelWindows.forEach((reelWindow, index) => {
    doc.registerElement(`reel-${index + 1}-window`, reelWindow);
  });
  stopButtons.forEach((button, index) => {
    doc.registerElement(`stop-button-${index + 1}`, button);
  });

  return {
    doc,
    elements: {
      creditDisplay,
      betDisplay,
      eventLog,
      betButton,
      spinButton,
      resetButton,
      reelWindows,
      stopButtons,
    },
    initialCredits,
  };
}

function latestLogText(eventLog) {
  return eventLog.children[0]?.textContent ?? '';
}

test('formatNumber pads values with leading zeros', () => {
  assert.equal(formatNumber(7), '007');
  assert.equal(formatNumber(42, 4), '0042');
});

test('mountSlotMachine initialises displays and startup log', () => {
  const { doc, elements } = createTestDocument();
  const machine = mountSlotMachine(doc, {
    timestampProvider: () => new Date('2023-01-01T00:00:00Z'),
  });

  assert.equal(elements.creditDisplay.textContent, '050');
  assert.equal(elements.betDisplay.textContent, '00');
  assert.equal(elements.eventLog.children.length, 1);
  assert.ok(latestLogText(elements.eventLog).includes('スロット基盤を初期化しました。'));
  assert.ok(machine);
});

test('handleBet increases bet until the configured maximum', () => {
  const { doc, elements } = createTestDocument();
  const machine = mountSlotMachine(doc, {
    timestampProvider: () => new Date('2023-01-01T00:00:00Z'),
  });

  machine.handleBet();
  machine.handleBet();
  machine.handleBet();
  machine.handleBet();

  assert.equal(elements.betDisplay.textContent, '03');
  assert.ok(latestLogText(elements.eventLog).includes('BETは最大値です。'));
});

test('handleBet blocks wagers that exceed available credits', () => {
  const { doc, elements } = createTestDocument();
  const machine = mountSlotMachine(doc, {
    initialCredits: 2,
    timestampProvider: () => new Date('2023-01-01T00:00:00Z'),
  });

  machine.handleBet();
  machine.handleBet();
  machine.handleBet();

  assert.equal(elements.betDisplay.textContent, '02');
  assert.ok(latestLogText(elements.eventLog).includes('クレジットが不足しています。'));
});

test('handleSpin consumes credits and resets bet', () => {
  const { doc, elements } = createTestDocument();
  const machine = mountSlotMachine(doc, {
    timestampProvider: () => new Date('2023-01-01T00:00:00Z'),
  });

  machine.handleBet();
  machine.handleBet();
  machine.handleSpin();

  assert.equal(elements.creditDisplay.textContent, '048');
  assert.equal(elements.betDisplay.textContent, '00');
  assert.ok(latestLogText(elements.eventLog).includes('BET: 02'));
});

test('stopReel halts spinning reels and finalises the spin', () => {
  const { doc, elements } = createTestDocument();
  const machine = mountSlotMachine(doc, {
    timestampProvider: () => new Date('2023-01-01T00:00:00Z'),
    randomProvider: () => 0,
  });

  machine.handleBet();
  machine.handleSpin();

  elements.stopButtons.forEach((button) => {
    assert.equal(button.disabled, false);
  });

  machine.stopReel(0);
  machine.stopReel(1);
  machine.stopReel(2);

  assert.equal(elements.spinButton.disabled, false);
  elements.stopButtons.forEach((button) => {
    assert.equal(button.disabled, true);
  });
  assert.ok(latestLogText(elements.eventLog).includes('スピン終了'));
});

test('handleSpin warns when no bet is set', () => {
  const { doc, elements } = createTestDocument();
  const machine = mountSlotMachine(doc, {
    timestampProvider: () => new Date('2023-01-01T00:00:00Z'),
  });

  machine.handleSpin();

  assert.ok(latestLogText(elements.eventLog).includes('BETが設定されていません。'));
});

test('handleReset restores the initial state and clears logs', () => {
  const { doc, elements } = createTestDocument();
  const machine = mountSlotMachine(doc, {
    timestampProvider: () => new Date('2023-01-01T00:00:00Z'),
  });

  machine.handleBet();
  machine.handleSpin();
  machine.handleReset();

  assert.equal(elements.creditDisplay.textContent, '050');
  assert.equal(elements.betDisplay.textContent, '00');
  assert.equal(elements.eventLog.children.length, 1);
  assert.ok(latestLogText(elements.eventLog).includes('初期状態にリセットしました。'));
});

test('addLog trims the oldest entries when exceeding the limit', () => {
  const { doc, elements } = createTestDocument();
  const machine = mountSlotMachine(doc, {
    maxLogItems: 3,
    timestampProvider: () => new Date('2023-01-01T00:00:00Z'),
  });

  for (let i = 0; i < 5; i += 1) {
    machine.addLog(`テストログ${i}`);
  }

  assert.equal(elements.eventLog.children.length, 3);
  const oldest = elements.eventLog.children.at(-1);
  assert.ok(oldest.textContent.includes('テストログ2'));
});
