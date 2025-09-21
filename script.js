export const DEFAULT_CONFIG = {
  initialCredits: 50,
  maxBet: 3,
  maxLogItems: 6,
  timestampProvider: () => new Date(),
  symbols: ['7', 'BAR', '🍒', '🍇', '🍋', '🔔', '⭐'],
  randomProvider: () => Math.random(),
  reelVisibleSymbols: 3,
  reelSpinInterval: 120,
};

export function formatNumber(value, digits = 3) {
  return value.toString().padStart(digits, '0');
}

function formatTimestamp(date) {
  const targetDate = date instanceof Date ? date : new Date(date);
  return targetDate.toLocaleTimeString('ja-JP', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export class SlotMachine {
  constructor(elements, config = {}) {
    const {
      creditDisplay,
      betDisplay,
      eventLog,
      betButton,
      spinButton,
      resetButton,
      reelWindows = [],
      stopButtons = [],
    } = elements;

    if (!creditDisplay || !betDisplay || !eventLog) {
      throw new Error(
        'SlotMachine requires creditDisplay, betDisplay, and eventLog elements.'
      );
    }

    if (reelWindows.length === 0) {
      throw new Error('SlotMachine requires at least one reel window element.');
    }

    this.creditDisplay = creditDisplay;
    this.betDisplay = betDisplay;
    this.eventLog = eventLog;
    this.betButton = betButton;
    this.spinButton = spinButton;
    this.resetButton = resetButton;

    this.config = { ...DEFAULT_CONFIG, ...config };

    this.credits = this.config.initialCredits;
    this.bet = 0;
    this.isSpinning = false;

    this.reels = reelWindows.map((windowElement, index) => ({
      windowElement,
      stopButton: stopButtons[index] ?? null,
      intervalId: null,
      isSpinning: false,
      currentSymbols: [],
    }));

    this.handleBet = this.handleBet.bind(this);
    this.handleSpin = this.handleSpin.bind(this);
    this.handleReset = this.handleReset.bind(this);
  }

  init() {
    if (this.betButton) {
      this.betButton.addEventListener('click', this.handleBet);
    }

    if (this.spinButton) {
      this.spinButton.addEventListener('click', this.handleSpin);
    }

    if (this.resetButton) {
      this.resetButton.addEventListener('click', this.handleReset);
    }

    this.reels.forEach((reel, index) => {
      if (reel.stopButton) {
        reel.stopHandler = () => {
          this.stopReel(index);
        };
        reel.stopButton.addEventListener('click', reel.stopHandler);
        reel.stopButton.disabled = true;
      }
    });

    this.updateDisplays();
    this.addLog('スロット基盤を初期化しました。');
    return this;
  }

  updateDisplays() {
    this.creditDisplay.textContent = formatNumber(this.credits);
    this.betDisplay.textContent = formatNumber(this.bet, 2);
  }

  addLog(message) {
    const logItem = this.eventLog.ownerDocument.createElement('li');
    logItem.className = 'log__item';

    const timestamp = formatTimestamp(this.config.timestampProvider());
    logItem.textContent = `[${timestamp}] ${message}`;
    this.eventLog.prepend(logItem);

    while (this.eventLog.children.length > this.config.maxLogItems) {
      this.eventLog.removeChild(this.eventLog.lastElementChild);
    }
  }

  handleBet() {
    if (this.bet >= this.config.maxBet) {
      this.addLog('BETは最大値です。');
      return;
    }

    if (this.bet + 1 > this.credits) {
      this.addLog('クレジットが不足しています。');
      return;
    }

    this.bet += 1;
    this.updateDisplays();
    this.addLog(`BETが ${formatNumber(this.bet, 2)} に設定されました。`);
  }

  handleSpin() {
    if (this.isSpinning) {
      this.addLog('リールが回転中です。');
      return;
    }

    if (this.bet === 0) {
      this.addLog('BETが設定されていません。');
      return;
    }

    if (this.credits < this.bet) {
      this.addLog('クレジットが不足しています。');
      return;
    }

    const betUsed = this.bet;
    this.credits -= betUsed;
    this.bet = 0;
    this.updateDisplays();
    this.addLog(
      `スピン開始！ BET: ${formatNumber(
        betUsed,
        2
      )} / 残りクレジット: ${formatNumber(this.credits)}`
    );

    this.startReelSpin();
  }

  handleReset() {
    this.stopAllReels({ silent: true });
    this.credits = this.config.initialCredits;
    this.bet = 0;
    this.eventLog.innerHTML = '';
    this.updateDisplays();
    this.addLog('初期状態にリセットしました。');
  }

  startReelSpin() {
    this.isSpinning = true;
    if (this.spinButton) {
      this.spinButton.disabled = true;
    }

    this.reels.forEach((reel) => {
      reel.isSpinning = true;
      this.setStopButtonState(reel, false);
      this.refreshReelSymbols(reel);
      reel.intervalId = setInterval(() => {
        this.refreshReelSymbols(reel);
      }, this.config.reelSpinInterval);
      if (typeof reel.intervalId?.unref === 'function') {
        reel.intervalId.unref();
      }
    });
  }

  stopReel(index) {
    const reel = this.reels[index];
    if (!reel || !reel.isSpinning) {
      return;
    }

    if (reel.intervalId) {
      clearInterval(reel.intervalId);
      reel.intervalId = null;
    }

    reel.isSpinning = false;
    this.setStopButtonState(reel, true);

    const centerIndex = Math.floor(this.config.reelVisibleSymbols / 2);
    const centerSymbol = reel.currentSymbols[centerIndex] ?? reel.currentSymbols[0] ?? '?';
    this.addLog(`リール${index + 1}を停止 (${centerSymbol})。`);

    if (this.reels.every((item) => !item.isSpinning)) {
      this.finishSpin();
    }
  }

  finishSpin() {
    this.isSpinning = false;
    if (this.spinButton) {
      this.spinButton.disabled = false;
    }

    this.reels.forEach((reel) => {
      this.setStopButtonState(reel, true);
    });

    const centerIndex = Math.floor(this.config.reelVisibleSymbols / 2);
    const result = this.reels
      .map((reel) => reel.currentSymbols[centerIndex] ?? reel.currentSymbols[0] ?? '?')
      .join(' | ');
    this.addLog(`スピン終了 - 出目: ${result}`);
  }

  stopAllReels({ silent = false } = {}) {
    this.reels.forEach((reel, index) => {
      if (reel.intervalId) {
        clearInterval(reel.intervalId);
        reel.intervalId = null;
      }

      const wasSpinning = reel.isSpinning;
      reel.isSpinning = false;
      this.setStopButtonState(reel, true);

      if (wasSpinning && !silent) {
        this.addLog(`リール${index + 1}を強制停止しました。`);
      }
    });

    if (this.spinButton) {
      this.spinButton.disabled = false;
    }
    this.isSpinning = false;
  }

  setStopButtonState(reel, disabled) {
    if (reel.stopButton) {
      reel.stopButton.disabled = disabled;
    }
  }

  refreshReelSymbols(reel) {
    const nextSymbols = this.generateReelSymbols();
    const symbolElements = Array.from(reel.windowElement.children);
    const sourceLength = nextSymbols.length || 1;

    symbolElements.forEach((child, idx) => {
      const symbol = nextSymbols[idx % sourceLength];
      child.textContent = symbol;
    });

    reel.currentSymbols = nextSymbols;
  }

  generateReelSymbols() {
    const visibleCount = Math.max(1, this.config.reelVisibleSymbols);
    return Array.from({ length: visibleCount }, () => this.pickRandomSymbol());
  }

  pickRandomSymbol() {
    const pool = this.config.symbols;
    if (!Array.isArray(pool) || pool.length === 0) {
      return '?';
    }

    const randomValue = this.config.randomProvider();
    const index = Math.floor(Math.abs(randomValue) * pool.length) % pool.length;
    return pool[index];
  }
}

export function mountSlotMachine(doc = document, config = {}) {
  if (!doc) {
    throw new Error('A document instance is required to mount the slot machine.');
  }

  const elements = {
    creditDisplay: doc.getElementById('credit-display'),
    betDisplay: doc.getElementById('bet-display'),
    eventLog: doc.getElementById('event-log'),
    betButton: doc.getElementById('bet-button'),
    spinButton: doc.getElementById('spin-button'),
    resetButton: doc.getElementById('reset-button'),
    reelWindows: [
      doc.getElementById('reel-1-window'),
      doc.getElementById('reel-2-window'),
      doc.getElementById('reel-3-window'),
    ].filter(Boolean),
    stopButtons: [
      doc.getElementById('stop-button-1'),
      doc.getElementById('stop-button-2'),
      doc.getElementById('stop-button-3'),
    ].filter(Boolean),
  };

  return new SlotMachine(elements, config).init();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      mountSlotMachine(document);
    });
  } else {
    mountSlotMachine(document);
  }
}
