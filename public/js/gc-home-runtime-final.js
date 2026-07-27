(() => {
  /*
   * GC_HOME_RUNTIME_FINAL_V10_NO_RANKING_WRITES
   *
   * The home ranking is owned exclusively by src/pages/index.astro.
   * This legacy runtime must not render, observe, or repair the ranking:
   * doing so races with the canonical pilot-link/avatar enrichment.
   */
  const GT4 = '[data-home2-combo-ranking-gt4]';
  const TIMING =
    '[data-home2-timing-sheet], [data-home2-latest-laps], ' +
    '.gc-home2-timing-sheet tbody, .gc-home2-timing-list';

  const enforceSimpleLimits = () => {
    const gt4 = document.querySelector(GT4);
    if (gt4) {
      [...gt4.children].forEach((row, index) => {
        if (row instanceof HTMLElement) row.style.display = index < 8 ? '' : 'none';
      });
    }

    const timing = document.querySelector(TIMING);
    if (timing) {
      [...timing.children].forEach((row, index) => {
        if (row instanceof HTMLElement) row.style.display = index < 10 ? '' : 'none';
      });
    }

    document.documentElement.dataset.gcHomeRuntimeFinal =
      'v10-no-ranking-writes';
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enforceSimpleLimits, {
      once: true,
    });
  } else {
    enforceSimpleLimits();
  }
})();
