export const DEFAULT_CONFIG = {
  initialCredits: 120,
  ballCost: 1,
  maxLogItems: 8,
  animationDuration: 1400,
  spinDuration: 900,
  timestampProvider: () => new Date(),
  randomProvider: () => Math.random(),
  hitRate: 1 / 99,
  rushRate: 0.25,
  rushRewardMultiplier: 4,
  pockets: [
    {
      id: 'jackpot',
      label: '超特賞',
      reward: 50,
      rushReward: 200,
      weight: 1,
      shift: '0px',
      midShift: '12px',
      earlyShift: '-18px',
    },
    {
      id: 'gold',
      label: '黄金ポケット',
      reward: 20,
      rushReward: 80,
      weight: 2,
      shift: '-80px',
      midShift: '-30px',
      earlyShift: '12px',
    },
    {
      id: 'silver-left',
      label: 'シルバーL',
      reward: 10,
      rushReward: 40,
      weight: 3,
      shift: '-160px',
      midShift: '-90px',
      earlyShift: '-40px',
    },
    {
      id: 'silver-right',
      label: 'シルバーR',
      reward: 10,
      rushReward: 40,
      weight: 3,
      shift: '160px',
      midShift: '90px',
      earlyShift: '40px',
    },
    {
      id: 'miss',
      label: 'ハズレ',
      reward: 0,
      weight: 5,
      shift: '80px',
      midShift: '30px',
      earlyShift: '-12px',
      className: 'pocket--miss',
    },
  ],
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

export class PachinkoGame {
  constructor(elements, config = {}) {
    const {
      creditDisplay,
      ballCountDisplay,
      lastResultDisplay,
      eventLog,
      shootButton,
      resetButton,
      board,
      pocketRow,
    } = elements;

    if (!creditDisplay || !ballCountDisplay || !eventLog) {
      throw new Error(
        'PachinkoGame requires creditDisplay, ballCountDisplay, and eventLog elements.'
      );
    }

    this.creditDisplay = creditDisplay;
    this.ballCountDisplay = ballCountDisplay;
    this.lastResultDisplay = lastResultDisplay ?? null;
    this.eventLog = eventLog;
    this.shootButton = shootButton ?? null;
    this.resetButton = resetButton ?? null;
    this.board = board ?? null;
    this.pocketRow = pocketRow ?? null;

    this.config = { ...DEFAULT_CONFIG, ...config };

    if (!Array.isArray(this.config.pockets) || this.config.pockets.length === 0) {
      throw new Error('PachinkoGame requires at least one pocket configuration.');
    }

    this.credits = this.config.initialCredits;
    this.ballCount = 0;
    this.isDropping = false;
    this.pocketElements = new Map();
    this.highlightTimeout = null;
    this.spinTimeouts = new Map();
    this.lastOutcome = null;

    this.handleShoot = this.handleShoot.bind(this);
    this.handleReset = this.handleReset.bind(this);
  }

  init() {
    if (this.shootButton) {
      this.shootButton.addEventListener('click', this.handleShoot);
    }

    if (this.resetButton) {
      this.resetButton.addEventListener('click', this.handleReset);
    }

    this.renderPockets();
    this.updateDisplays();
    this.addLog('パチンコ盤面を初期化しました。');
    return this;
  }

  renderPockets() {
    if (!this.pocketRow) {
      return;
    }

    this.pocketRow.innerHTML = '';
    this.pocketElements.clear();

    this.config.pockets.forEach((pocket) => {
      const pocketElement = this.pocketRow.ownerDocument.createElement('div');
      pocketElement.className = 'pocket';
      if (pocket.className) {
        pocketElement.className += ` ${pocket.className}`;
      }

      const label = this.pocketRow.ownerDocument.createElement('span');
      label.className = 'pocket__label';
      label.textContent = pocket.label;

      const reward = this.pocketRow.ownerDocument.createElement('span');
      reward.className = 'pocket__reward';
      reward.textContent =
        pocket.reward > 0 ? `通常 +${pocket.reward}` : 'ハズレ';

      pocketElement.appendChild(label);
      pocketElement.appendChild(reward);

      if (pocket.rushReward && pocket.reward > 0) {
        const rushReward = this.pocketRow.ownerDocument.createElement('span');
        rushReward.className = 'pocket__reward pocket__reward--rush';
        rushReward.textContent = `RUSH +${pocket.rushReward}`;
        pocketElement.appendChild(rushReward);
      }

      this.pocketRow.appendChild(pocketElement);
      this.pocketElements.set(pocket.id, pocketElement);
    });
  }

  updateDisplays() {
    this.creditDisplay.textContent = formatNumber(this.credits);
    this.ballCountDisplay.textContent = formatNumber(this.ballCount);
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

  handleShoot() {
    if (this.isDropping) {
      this.addLog('玉が落下中です。終了をお待ちください。');
      return;
    }

    if (this.credits < this.config.ballCost) {
      this.addLog('クレジットが不足しています。');
      return;
    }

    this.credits -= this.config.ballCost;
    this.ballCount += 1;
    this.updateDisplays();

    const pocket = this.pickPocket();
    this.isDropping = true;
    this.setShootButtonState(true);

    this.addLog(
      `玉を発射 (消費:${formatNumber(
        this.config.ballCost,
        2
      )} / 残り:${formatNumber(this.credits)})`
    );

    this.animateBall(pocket);
  }

  setShootButtonState(disabled) {
    if (this.shootButton) {
      this.shootButton.disabled = disabled;
    }
  }

  animateBall(pocket) {
    if (!this.board) {
      this.finalizeDrop(pocket);
      return;
    }

    const ball = this.board.ownerDocument.createElement('div');
    ball.className = 'board__ball';

    ball.style.setProperty('--drop-duration', `${this.config.animationDuration}ms`);
    if (pocket.shift) {
      ball.style.setProperty('--shift', pocket.shift);
    }
    if (pocket.midShift) {
      ball.style.setProperty('--mid-shift', pocket.midShift);
    }
    if (pocket.earlyShift) {
      ball.style.setProperty('--early-shift', pocket.earlyShift);
    }

    const finalize = () => {
      if (ball.parentNode === this.board) {
        this.board.removeChild(ball);
      }
      this.finalizeDrop(pocket);
    };

    if (typeof ball.addEventListener === 'function') {
      ball.addEventListener('animationend', finalize, { once: true });
    }

    this.board.appendChild(ball);

    if (
      !this.config.animationDuration ||
      typeof ball.addEventListener !== 'function'
    ) {
      finalize();
    }
  }

  finalizeDrop(pocket) {
    const outcome = this.resolvePocketOutcome(pocket);
    if (outcome.reward > 0) {
      this.credits += outcome.reward;
    }

    this.isDropping = false;
    this.setShootButtonState(false);
    this.updateDisplays();
    this.lastOutcome = outcome;

    this.updateLastResult(pocket, outcome);
    this.highlightPocket(pocket.id, outcome.isWin);
    this.spinPocket(pocket.id);

    if (outcome.isWin) {
      if (outcome.isRush) {
        this.addLog(
          `${pocket.label}で大当たり！RUSH突入、${outcome.reward}枚獲得！`
        );
      } else {
        this.addLog(
          `${pocket.label}が発動！ ${outcome.reward}枚の当たりです。`
        );
      }
    } else {
      this.addLog(`${pocket.label}・・・残念！`);
    }
  }

  updateLastResult(pocket, outcome) {
    if (!this.lastResultDisplay) {
      return;
    }

    const reward = outcome.reward ?? 0;
    if (outcome.isWin) {
      this.lastResultDisplay.textContent = outcome.isRush
        ? `${pocket.label} / RUSH +${reward}`
        : `${pocket.label} / 当たり +${reward}`;
    } else {
      this.lastResultDisplay.textContent = `${pocket.label} / ハズレ`;
    }
  }

  highlightPocket(pocketId, isWin = false) {
    if (!this.pocketElements.size) {
      return;
    }

    if (this.highlightTimeout) {
      clearTimeout(this.highlightTimeout);
      this.highlightTimeout = null;
    }

    this.pocketElements.forEach((element) => {
      element.classList.remove('is-active');
      element.classList.remove('is-win');
    });

    const target = this.pocketElements.get(pocketId);
    if (target) {
      target.classList.add('is-active');
      if (isWin) {
        target.classList.add('is-win');
      }
      this.highlightTimeout = setTimeout(() => {
        target.classList.remove('is-active');
        target.classList.remove('is-win');
      }, 800);
      if (typeof this.highlightTimeout?.unref === 'function') {
        this.highlightTimeout.unref();
      }
    }
  }

  spinPocket(pocketId) {
    if (!this.pocketElements.size) {
      return;
    }

    const target = this.pocketElements.get(pocketId);
    if (!target) {
      return;
    }

    const existingTimeout = this.spinTimeouts.get(pocketId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.spinTimeouts.delete(pocketId);
    }

    target.classList.remove('is-spinning');

    const startSpin = () => {
      target.classList.add('is-spinning');
      const timeout = setTimeout(() => {
        target.classList.remove('is-spinning');
        this.spinTimeouts.delete(pocketId);
      }, this.config.spinDuration);

      if (typeof timeout?.unref === 'function') {
        timeout.unref();
      }

      this.spinTimeouts.set(pocketId, timeout);
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(startSpin);
    } else {
      startSpin();
    }
  }

  resolvePocketOutcome(pocket) {
    const reward = pocket.reward ?? 0;
    if (reward <= 0) {
      return { isWin: false, reward: 0, isRush: false };
    }

    const hitRate = Math.max(0, Math.min(1, this.config.hitRate ?? 0));
    const rushRate = Math.max(0, Math.min(1, this.config.rushRate ?? 0));
    const rushMultiplier = Math.max(
      1,
      this.config.rushRewardMultiplier ?? 1
    );

    if (hitRate <= 0) {
      return { isWin: false, reward: 0, isRush: false };
    }

    const hitRoll = this.getRandom();
    if (hitRoll >= hitRate) {
      return { isWin: false, reward: 0, isRush: false };
    }

    const rushRoll = this.getRandom();
    const isRush = rushRoll < rushRate;
    const rushReward = pocket.rushReward
      ? Math.max(pocket.rushReward, reward)
      : reward * rushMultiplier;

    return {
      isWin: true,
      isRush,
      reward: isRush ? rushReward : reward,
    };
  }

  pickPocket() {
    const pockets = this.config.pockets;
    const weights = pockets.map((pocket) => Math.max(pocket.weight ?? 1, 0));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    if (totalWeight <= 0) {
      return pockets[0];
    }

    const randomValue = this.getRandom() * totalWeight;
    let cumulative = 0;

    for (let index = 0; index < pockets.length; index += 1) {
      cumulative += weights[index];
      if (randomValue < cumulative) {
        return pockets[index];
      }
    }

    return pockets[pockets.length - 1];
  }

  getRandom() {
    const provider = this.config.randomProvider;
    const value =
      typeof provider === 'function' ? Math.abs(provider()) : Math.random();
    return value - Math.floor(value);
  }

  handleReset() {
    this.credits = this.config.initialCredits;
    this.ballCount = 0;
    this.isDropping = false;
    this.eventLog.innerHTML = '';
    this.updateDisplays();
    if (this.lastResultDisplay) {
      this.lastResultDisplay.textContent = '---';
    }
    this.setShootButtonState(false);
    this.pocketElements.forEach((element) => {
      element.classList.remove('is-active', 'is-win', 'is-spinning');
    });
    this.spinTimeouts.forEach((timeout) => {
      clearTimeout(timeout);
    });
    this.spinTimeouts.clear();
    this.addLog('初期状態にリセットしました。');
  }
}

export function mountPachinko(doc = document, config = {}) {
  if (!doc) {
    throw new Error('A document instance is required to mount the pachinko game.');
  }

  const elements = {
    creditDisplay: doc.getElementById('credit-display'),
    ballCountDisplay: doc.getElementById('ball-count'),
    lastResultDisplay: doc.getElementById('last-result'),
    eventLog: doc.getElementById('event-log'),
    shootButton: doc.getElementById('shoot-button'),
    resetButton: doc.getElementById('reset-button'),
    board: doc.getElementById('pachinko-board'),
    pocketRow: doc.getElementById('pocket-row'),
  };

  return new PachinkoGame(elements, config).init();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      mountPachinko(document);
    });
  } else {
    mountPachinko(document);
  }
}
