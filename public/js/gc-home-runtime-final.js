(() => {
  const HOME_SELECTOR = '[data-gc-home2]';
  const MAIN_RANKING = '[data-home2-combo-ranking]';
  const GT4_RANKING = '[data-home2-combo-ranking-gt4]';
  const TIMING_SHEET = '[data-home2-timing-sheet], [data-home2-latest-laps], .gc-home2-timing-sheet tbody, .gc-home2-timing-list';

  const srRankName = (score) => {
    const value = Number(score);
    if (!Number.isFinite(value)) return '';
    if (value >= 95) return 'LEGEND';
    if (value >= 90) return 'ELITE';
    if (value >= 80) return 'PRO';
    if (value >= 70) return 'ADVANCED';
    if (value >= 60) return 'ROOKIE';
    return 'PITLANE';
  };

  const gsrRankName = (score) => {
    const value = Number(score);
    if (!Number.isFinite(value)) return '';
    if (value >= 1750) return 'DIAMOND';
    if (value >= 1650) return 'RUBY';
    if (value >= 1550) return 'SAPPHIRE';
    if (value >= 1475) return 'EMERALD';
    if (value >= 1400) return 'AMBER';
    return 'ONYX';
  };

  const parseNumber = (value) => {
    const normalized = String(value || '').replace(/\./g, '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    return normalized ? Number(normalized[0]) : NaN;
  };

  const enforceTopEight = (selector) => {
    const host = document.querySelector(selector);
    if (!host) return;

    const rows = Array.from(host.children).filter((node) => node instanceof HTMLElement);
    rows.forEach((row, index) => {
      row.style.display = index < 8 ? '' : 'none';
    });

    host.style.maxHeight = 'none';
    host.style.overflow = 'visible';
    host.dataset.gcVisibleRows = '8';
  };

  const enforceTimingTen = () => {
    const host = document.querySelector(TIMING_SHEET);
    if (!host) return;
    const rows = Array.from(host.children).filter((node) => node instanceof HTMLElement);
    rows.forEach((row, index) => {
      row.style.display = index < 10 ? '' : 'none';
    });
    host.style.maxHeight = 'none';
    host.style.overflow = 'visible';
    host.dataset.gcVisibleRows = '10';
  };

  const enforcePopoverLabels = () => {
    const popover = document.querySelector('[data-home-pilot-popover]');
    if (!popover || !popover.classList.contains('is-open')) return;

    const ratings = popover.querySelectorAll('.gc-home-pilot-popover__rating');
    if (ratings[0]) {
      const value = parseNumber(ratings[0].querySelector('strong')?.textContent);
      const label = srRankName(value);
      const labelNode = ratings[0].querySelector('span');
      if (labelNode && label) labelNode.textContent = label;
    }
    if (ratings[1]) {
      const value = parseNumber(ratings[1].querySelector('strong')?.textContent);
      const label = gsrRankName(value);
      const labelNode = ratings[1].querySelector('span');
      if (labelNode && label) labelNode.textContent = label;
    }
  };

  const apply = () => {
    if (!document.querySelector(HOME_SELECTOR)) return;
    enforceTopEight(MAIN_RANKING);
    enforceTopEight(GT4_RANKING);
    enforcePopoverLabels();
    document.documentElement.dataset.gcHomeRuntimeFinal = 'v2-rows-8-10';
  };

  const start = () => {
    apply();
    const root = document.querySelector(HOME_SELECTOR);
    if (!root) return;

    let timer = 0;
    new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, 30);
    }).observe(root, { childList: true, subtree: true, characterData: true });

    window.setTimeout(apply, 500);
    window.setTimeout(apply, 1500);
    window.setTimeout(apply, 3500);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
