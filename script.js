export const DEFAULT_CONFIG = {
  initialCredits: 50,
  maxBet: 3,
  maxLogItems: 6,
  timestampProvider: () => new Date(),
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
    } = elements;

    if (!creditDisplay || !betDisplay || !eventLog) {
      throw new Error(
        'SlotMachine requires creditDisplay, betDisplay, and eventLog elements.'
      );
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
  }

  handleReset() {
    this.credits = this.config.initialCredits;
    this.bet = 0;
    this.eventLog.innerHTML = '';
    this.updateDisplays();
    this.addLog('初期状態にリセットしました。');
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
