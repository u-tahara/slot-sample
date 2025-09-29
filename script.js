export const DEFAULT_CONFIG = {
  initialCredits: 120,
  ballCost: 1,
  maxLogItems: 8,
  animationDuration: 1400,
  spinDuration: 900,
  reelSpinDuration: 600,
  reachHoldDuration: 1600,
  reachChance: 0.25,
  timestampProvider: () => new Date(),
  randomProvider: () => Math.random(),
  hitRate: 1 / 99,
  rushRate: 0.25,
  rushRewardMultiplier: 4,
  reelSymbols: ['7', 'BAR', '🍒', '🔔', '⭐', '🍀'],
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
      reelContainer,
      reachDisplay,
      hitRateDisplay,
      rushRateDisplay,
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
    this.reelContainer = reelContainer ?? null;
    this.reachDisplay = reachDisplay ?? null;
    this.hitRateDisplay = hitRateDisplay ?? null;
    this.rushRateDisplay = rushRateDisplay ?? null;

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
    this.reels = [];
    this.reachTimeout = null;

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
    this.renderReels();
    this.resetReels();
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

  renderReels() {
    if (!this.reelContainer) {
      return;
    }

    this.reelContainer.innerHTML = '';
    this.reels = [];

    for (let index = 0; index < 3; index += 1) {
      const reel = this.reelContainer.ownerDocument.createElement('div');
      reel.className = 'reel';

      const windowElement = this.reelContainer.ownerDocument.createElement('div');
      windowElement.className = 'reel__window';

      const symbol = this.reelContainer.ownerDocument.createElement('span');
      symbol.className = 'reel__symbol';
      symbol.textContent = '---';

      windowElement.appendChild(symbol);
      reel.appendChild(windowElement);
      this.reelContainer.appendChild(reel);

      this.reels.push({ reel, windowElement, symbol });
    }
  }

  resetReels() {
    if (!this.reels.length) {
      return;
    }

    this.reels.forEach(({ reel, symbol }) => {
      reel.classList.remove('is-spinning', 'is-win', 'is-rush');
      symbol.textContent = '---';
    });
    this.showReach(false);
  }

  showReach(isVisible, message = 'リーチ！') {
    if (!this.reachDisplay) {
      return;
    }

    if (this.reachTimeout) {
      clearTimeout(this.reachTimeout);
      this.reachTimeout = null;
    }

    if (isVisible) {
      this.reachDisplay.textContent = message;
      this.reachDisplay.classList.add('is-visible');

      const holdDuration = Math.max(0, this.config.reachHoldDuration ?? 0);
      if (holdDuration > 0) {
        this.reachTimeout = setTimeout(() => {
          this.showReach(false);
        }, holdDuration);

        if (typeof this.reachTimeout?.unref === 'function') {
          this.reachTimeout.unref();
        }
      }
    } else {
      this.reachDisplay.textContent = '---';
      this.reachDisplay.classList.remove('is-visible');
    }
  }

  playReelSequence(outcome) {
    if (!this.reels.length) {
      return;
    }

    const sequence = this.buildReelSequence(outcome);
    const duration = Math.max(0, this.config.reelSpinDuration ?? 0);

    this.reels.forEach(({ reel }) => {
      reel.classList.remove('is-win', 'is-rush');
    });
    this.showReach(false);

    let chain = Promise.resolve();

    sequence.forEach((step, index) => {
      chain = chain.then(
        () =>
          new Promise((resolve) => {
            const { reel, windowElement, symbol } = this.reels[index];

            windowElement.style.setProperty('--reel-duration', `${duration}ms`);
            reel.classList.add('is-spinning');
            symbol.textContent = '';

            const finish = () => {
              reel.classList.remove('is-spinning');
              symbol.textContent = step.symbol;
              if (step.triggerReach) {
                this.showReach(true, step.reachText ?? 'リーチ！');
              }
              if (step.isFinal && outcome.isWin) {
                this.reels.forEach(({ reel: targetReel }) => {
                  targetReel.classList.add(outcome.isRush ? 'is-rush' : 'is-win');
                });
              }
              resolve();
            };

            if (duration <= 0) {
              finish();
              return;
            }

            const timeout = setTimeout(finish, duration);
            if (typeof timeout?.unref === 'function') {
              timeout.unref();
            }
          })
      );
    });

    // Ensure the promise chain errors are not unhandled but do not block gameplay.
    chain.catch(() => {});
  }

  buildReelSequence(outcome) {
    const symbols = Array.isArray(this.config.reelSymbols)
      ? this.config.reelSymbols
      : DEFAULT_CONFIG.reelSymbols;

    const fallbackSymbol = symbols[0] ?? '---';

    const pickSymbol = () => {
      if (!symbols.length) {
        return '---';
      }

      const randomValue = this.getRandom();
      const index = Math.min(
        symbols.length - 1,
        Math.floor(randomValue * symbols.length)
      );
      return symbols[index] ?? fallbackSymbol;
    };

    const pickAlternativeSymbol = (exclude) => {
      if (!symbols.length) {
        return '---';
      }

      const alternative = symbols.find((symbol) => symbol !== exclude);
      return alternative ?? fallbackSymbol;
    };

    if (outcome.isWin) {
      const winSymbol = outcome.isRush ? 'RUSH' : '当たり';
      return [
        { symbol: winSymbol },
        { symbol: winSymbol, triggerReach: true },
        { symbol: winSymbol, isFinal: true },
      ];
    }

    const first = pickSymbol();
    let second = pickSymbol();
    let third = pickSymbol();

    const reachChance = Math.max(0, Math.min(1, this.config.reachChance ?? 0));
    const triggerReach =
      reachChance > 0 ? this.getRandom() < reachChance : false;

    if (triggerReach) {
      second = first;
      if (third === first) {
        third = pickAlternativeSymbol(first);
      }
    } else if (first === second && second === third) {
      third = pickAlternativeSymbol(second);
    }

    return [
      { symbol: first },
      { symbol: second, triggerReach },
      { symbol: third, isFinal: true },
    ];
  }

  updateDisplays() {
    this.creditDisplay.textContent = formatNumber(this.credits);
    this.ballCountDisplay.textContent = formatNumber(this.ballCount);
    this.updateProbabilityDisplays();
  }

  updateProbabilityDisplays() {
    if (this.hitRateDisplay) {
      const hitRate = Math.max(0, Math.min(1, Number(this.config.hitRate) || 0));
      if (hitRate <= 0) {
        this.hitRateDisplay.textContent = '---';
      } else if (hitRate >= 1) {
        this.hitRateDisplay.textContent = '1/1';
      } else {
        const inverse = 1 / hitRate;
        const rounded = Math.round(inverse);
        const difference = Math.abs(inverse - rounded);
        if (difference <= Math.max(0.01, inverse * 0.001)) {
          this.hitRateDisplay.textContent = `1/${rounded}`;
        } else {
          const percent = Math.round(hitRate * 1000) / 10;
          this.hitRateDisplay.textContent = `${percent.toLocaleString('ja-JP')}%`;
        }
      }
    }

    if (this.rushRateDisplay) {
      const rushRate = Math.max(0, Math.min(1, Number(this.config.rushRate) || 0));
      if (rushRate <= 0) {
        this.rushRateDisplay.textContent = '0%';
      } else if (rushRate >= 1) {
        this.rushRateDisplay.textContent = '100%';
      } else {
        const percent = Math.round(rushRate * 1000) / 10;
        const isInteger = Number.isInteger(percent);
        const value = isInteger
          ? percent.toString()
          : percent.toLocaleString('ja-JP', { minimumFractionDigits: 1 });
        this.rushRateDisplay.textContent = `${value}%`;
      }
    }
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
    this.playReelSequence(outcome);

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
    if (this.reachTimeout) {
      clearTimeout(this.reachTimeout);
      this.reachTimeout = null;
    }
    this.resetReels();
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
    reelContainer: doc.getElementById('reel-container'),
    reachDisplay: doc.getElementById('reach-indicator'),
    hitRateDisplay: doc.getElementById('hit-rate-display'),
    rushRateDisplay: doc.getElementById('rush-rate-display'),
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
