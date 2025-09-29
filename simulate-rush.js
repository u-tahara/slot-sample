import { PachinkoGame, DEFAULT_CONFIG } from './script.js';

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
}

class MockElement {
  constructor(id, ownerDocument) {
    this.id = id;
    this.ownerDocument = ownerDocument;
    this._className = '';
    this._classList = new MockClassList(this);
    this._children = [];
    this.textContent = '';
    this.style = {
      setProperty() {},
      removeProperty() {},
    };
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

  addEventListener() {}
}

class MockButton extends MockElement {
  constructor(id, ownerDocument) {
    super(id, ownerDocument);
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

function createSimulationEnvironment() {
  const doc = new MockDocument();
  const creditDisplay = new MockElement('credit-display', doc);
  const ballCountDisplay = new MockElement('ball-count', doc);
  const lastResultDisplay = new MockElement('last-result', doc);
  const eventLog = new MockElement('event-log', doc);
  const shootButton = new MockButton('shoot-button', doc);
  const resetButton = new MockButton('reset-button', doc);
  const board = new MockElement('pachinko-board', doc);
  const pocketRow = new MockElement('pocket-row', doc);
  board.appendChild(pocketRow);

  doc.registerElement('credit-display', creditDisplay);
  doc.registerElement('ball-count', ballCountDisplay);
  doc.registerElement('last-result', lastResultDisplay);
  doc.registerElement('event-log', eventLog);
  doc.registerElement('shoot-button', shootButton);
  doc.registerElement('reset-button', resetButton);
  doc.registerElement('pachinko-board', board);
  doc.registerElement('pocket-row', pocketRow);

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
    },
  };
}

function simulateRush(randomProvider = DEFAULT_CONFIG.randomProvider) {
  const { doc } = createSimulationEnvironment();
  const config = {
    ...DEFAULT_CONFIG,
    animationDuration: 0,
    spinDuration: 0,
    randomProvider,
  };

  const game = new PachinkoGame(
    {
      creditDisplay: doc.getElementById('credit-display'),
      ballCountDisplay: doc.getElementById('ball-count'),
      lastResultDisplay: doc.getElementById('last-result'),
      eventLog: doc.getElementById('event-log'),
      shootButton: doc.getElementById('shoot-button'),
      resetButton: doc.getElementById('reset-button'),
      board: doc.getElementById('pachinko-board'),
      pocketRow: doc.getElementById('pocket-row'),
    },
    config
  ).init();

  while (game.credits >= config.ballCost) {
    game.handleShoot();
    if (game.lastOutcome?.isRush) {
      break;
    }
  }

  return {
    shots: game.ballCount,
    rushAchieved: Boolean(game.lastOutcome?.isRush),
    creditsRemaining: game.credits,
  };
}

const result = simulateRush();

if (result.rushAchieved) {
  console.log(`RUSH突入までに使用した玉数: ${result.shots}発`);
  console.log(`総ゲーム数: ${result.shots}回転`);
  console.log(`RUSH到達時の残りクレジット: ${result.creditsRemaining}`);
} else {
  console.log('クレジットを使い切るまでにRUSH突入はありませんでした。');
  console.log(`総使用玉数: ${result.shots}発`);
}
