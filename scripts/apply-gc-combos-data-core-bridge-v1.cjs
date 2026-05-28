#!/usr/bin/env node
/* GC_COMBOS_DATA_CORE_BRIDGE_V1_APPLY
 * Adds /api/gc/combos and bridges /combos UI to it.
 * Non-destructive: legacy /api/combos and existing /combos script remain as fallback.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');
const combosPath = path.join(root, 'src', 'pages', 'combos.astro');

const ROUTE_START = '/* GC_DATA_CORE_COMBOS_ROUTE_V1_START */';
const ROUTE_END = '/* GC_DATA_CORE_COMBOS_ROUTE_V1_END */';
const UI_START = '/* GC_COMBOS_DATA_CORE_BRIDGE_V1_START */';
const UI_END = '/* GC_COMBOS_DATA_CORE_BRIDGE_V1_END */';

function mustExist(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`[GC COMBOS CORE] Missing ${path.relative(root, filePath)}`);
    process.exit(1);
  }
}

function replaceBetween(source, start, end, block) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return source.slice(0, startIndex) + block.trimEnd() + '\n' + source.slice(endIndex + end.length);
  }

  return null;
}

function insertBefore(source, anchor, block, label) {
  const index = source.indexOf(anchor);
  if (index === -1) {
    console.error(`[GC COMBOS CORE] Missing anchor for ${label}: ${anchor}`);
    process.exit(1);
  }

  return source.slice(0, index) + block + '\n\n' + source.slice(index);
}

function insertBeforeLast(source, anchor, block, label) {
  const index = source.lastIndexOf(anchor);
  if (index === -1) {
    console.error(`[GC COMBOS CORE] Missing anchor for ${label}: ${anchor}`);
    process.exit(1);
  }

  return source.slice(0, index) + block + '\n' + source.slice(index);
}

mustExist(serverPath);
mustExist(combosPath);

let server = fs.readFileSync(serverPath, 'utf8');

const routeBlock = `
${ROUTE_START}
app.get('/api/gc/combos', async (req, res) => {
  const stracker = getSafeStrackerOrRespond(res);
  if (!stracker?.resolvedPath) return;

  try {
    const limit = getQueryNumber(req, 'limit', 300, 1, 1000);
    const q = getQueryString(req, 'q') || getQueryString(req, 'search');
    const sort = getQueryString(req, 'sort', 'recent').toLowerCase();

    const [laps, comboDefinitions] = await Promise.all([
      readJoinedLaps(stracker.resolvedPath),
      getCombos(stracker.resolvedPath)
    ]);

    let items = buildComboStatsFromLaps(laps, comboDefinitions);

    if (q) {
      items = items.filter((combo) => includesFilter(\`\${combo.comboId} \${combo.track?.name} \${combo.track?.code} \${combo.carSummary} \${combo.usedCarSummary} \${(combo.cars || []).map((car: any) => \`\${car.name} \${car.code} \${car.brand}\`).join(' ')}\`, q));
    }

    if (sort === 'laps') items = items.sort((a, b) => Number(b.totalLaps ?? 0) - Number(a.totalLaps ?? 0));
    else if (sort === 'drivers') items = items.sort((a, b) => Number(b.driversCount ?? 0) - Number(a.driversCount ?? 0));
    else if (sort === 'fastest') items = items.sort((a, b) => Number(a.bestLapMs ?? Infinity) - Number(b.bestLapMs ?? Infinity));
    else if (sort === 'clean') items = items.sort((a, b) => Number(b.cleanRate ?? 0) - Number(a.cleanRate ?? 0));
    else if (sort === 'cars') items = items.sort((a, b) => Number(b.carsCount ?? 0) - Number(a.carsCount ?? 0));
    else items = items.sort((a, b) => Number(b.lastSeenTimestamp ?? 0) - Number(a.lastSeenTimestamp ?? 0));

    const activeCombo = [...items]
      .filter((combo) => Number(combo.totalLaps ?? 0) > 0)
      .sort((a, b) => Number(b.lastSeenTimestamp ?? 0) - Number(a.lastSeenTimestamp ?? 0) || Number(b.totalLaps ?? 0) - Number(a.totalLaps ?? 0))[0] || null;

    const activeItems = items.filter((combo) => Number(combo.totalLaps ?? 0) > 0);
    const uniqueCarIds = new Set<string>();
    for (const combo of items) {
      for (const id of combo.carIds || []) {
        if (id !== null && id !== undefined) uniqueCarIds.add(String(id));
      }
    }

    res.json({
      ok: true,
      source: 'gc-data-core',
      generatedAt: new Date().toISOString(),
      mode: 'real-stracker',
      sort,
      filters: { q: q || null },
      count: Math.min(items.length, limit),
      totalCombos: items.length,
      activeCombos: activeItems.length,
      totalLaps: items.reduce((sum, combo) => sum + Number(combo.totalLaps ?? 0), 0),
      totalValidLaps: items.reduce((sum, combo) => sum + Number(combo.validLaps ?? 0), 0),
      carsCount: uniqueCarIds.size,
      activeCombo,
      items: items.slice(0, limit),
      stracker: {
        exists: stracker.exists,
        sizeBytes: stracker.sizeBytes,
        modifiedAt: stracker.modifiedAt
      },
      message: 'Combos canónicos generados desde GC Data Core. Usa este endpoint para /combos y futuras vistas.'
    });
  } catch (error) {
    console.error('[GC Data Core] Error generando /api/gc/combos:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-data-core',
      generatedAt: new Date().toISOString(),
      items: [],
      activeCombo: null,
      message: 'No se pudieron generar combos desde GC Data Core.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});
${ROUTE_END}
`;

const replacedServer = replaceBetween(server, ROUTE_START, ROUTE_END, routeBlock);
if (replacedServer !== null) {
  server = replacedServer;
} else {
  server = insertBefore(server, "app.get('/api/combos', async (_req, res) => {", routeBlock, '/api/gc/combos route');
}

fs.writeFileSync(serverPath, server, 'utf8');
console.log('[GC COMBOS CORE] Added/updated /api/gc/combos route.');

let combos = fs.readFileSync(combosPath, 'utf8');

const bridgeBlock = `
  <script is:inline>
    ${UI_START}
    (() => {
      const CORE_ENABLED = true;
      if (!CORE_ENABLED) return;

      const els = {
        total: document.getElementById('comboTotal'),
        visible: document.getElementById('comboVisible'),
        sortLabel: document.getElementById('comboSortLabel'),
        updated: document.getElementById('comboUpdated'),

        metricCombos: document.getElementById('metricCombos'),
        metricActive: document.getElementById('metricActive'),
        metricLaps: document.getElementById('metricLaps'),
        metricCars: document.getElementById('metricCars'),

        search: document.getElementById('comboSearch'),
        activity: document.getElementById('comboActivity'),
        sort: document.getElementById('comboSort'),
        reload: document.getElementById('reloadCombos'),
        clear: document.getElementById('clearCombos'),

        cardsMeta: document.getElementById('cardsMeta'),
        cards: document.getElementById('comboCards'),
        loadMore: document.getElementById('comboLoadMore'),

        recent: document.getElementById('comboFeatureRecent'),
        laps: document.getElementById('comboFeatureLaps'),
        clean: document.getElementById('comboFeatureClean')
      };

      if (!els.cards) return;

      let coreCombos = [];
      let visibleLimit = 12;
      let coreSummary = null;

      const setText = (node, value) => {
        if (node) node.textContent = String(value ?? '--');
      };

      const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[char]));

      const number = (value, fallback = 0) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      };

      const formatNumber = (value) => Math.max(0, Math.round(number(value, 0))).toLocaleString('es-ES');

      const valueAt = (source, path) => {
        if (!source || typeof source !== 'object') return undefined;
        if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];
        return String(path).split('.').reduce((acc, part) => acc == null ? undefined : acc[part], source);
      };

      const pick = (source, paths) => {
        for (const path of paths) {
          const value = valueAt(source, path);
          if (value !== undefined && value !== null && value !== '') return value;
        }
        return undefined;
      };

      const text = (value, fallback = '') => {
        if (value == null || value === '') return fallback;
        if (Array.isArray(value)) return value.length ? text(value[0], fallback) : fallback;
        if (typeof value === 'object') {
          return text(
            value.displayName ?? value.visibleName ?? value.cleanName ?? value.display_name ??
            value.uiName ?? value.uiCarName ?? value.uiTrackName ??
            value.name ?? value.Name ?? value.driverName ?? value.playerName ?? value.code,
            fallback
          );
        }
        return String(value).replace(/_/g, ' ').replace(/\\s+/g, ' ').trim() || fallback;
      };

      const normalize = (value) => text(value, '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .trim();

      const items = (data) => {
        if (Array.isArray(data)) return data;
        if (!data || typeof data !== 'object') return [];
        return data.items || data.data?.items || data.combos || [];
      };

      const displayTrack = (combo) => text(pick(combo, [
        'track.displayName','track.visibleName','track.cleanName','track.uiName','track.name',
        'trackName','displayTrackName','visibleTrackName','uiTrackName'
      ]), 'Combo');

      const cars = (combo) => {
        const raw = pick(combo, ['cars','carList','availableCars','comboCars']);
        const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(/[,|;]/g) : []);
        const seen = new Set();
        return arr
          .map((car) => text(car, ''))
          .filter(Boolean)
          .filter((name) => {
            const key = name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
      };

      const comboId = (combo) => pick(combo, ['canonicalComboId','comboId','id']);
      const comboUrl = (combo) => combo?.url || (comboId(combo) != null ? \`/combos/\${encodeURIComponent(comboId(combo))}\` : '/combos');
      const totalLaps = (combo) => number(pick(combo, ['totalLaps','stats.totalLaps','laps']), 0);
      const validLaps = (combo) => number(pick(combo, ['validLaps','stats.validLaps']), 0);
      const driversCount = (combo) => number(pick(combo, ['driversCount','stats.driversCount','pilotsCount','totalDrivers']), 0);
      const cleanRate = (combo) => totalLaps(combo) ? Math.round((validLaps(combo) / totalLaps(combo)) * 100) : number(pick(combo, ['cleanRate']), 0);
      const bestMs = (combo) => number(pick(combo, ['bestLapMs','bestLapTimeMs','bestLap.lapTimeMs','bestLap.LapTime']), Infinity);

      const bestTime = (combo) => {
        const direct = text(pick(combo, ['bestLapTime','bestTime','bestLap.lapTimeFormatted','bestLap.lapTimeText','bestLap.lapTime']), '');
        if (direct) return direct;
        const ms = bestMs(combo);
        if (!Number.isFinite(ms) || ms <= 0) return '--';
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const millis = Math.floor(ms % 1000);
        return \`\${minutes}:\${String(seconds).padStart(2, '0')}.\${String(millis).padStart(3, '0')}\`;
      };

      const bestDriver = (combo) => text(pick(combo, [
        'bestLap.driver.displayName','bestLap.driver.name','bestLap.driverName','bestLap.playerName','bestDriverName','fastestDriverName','leaderName'
      ]), 'Sin piloto');

      const bestCar = (combo) => text(pick(combo, [
        'bestLap.car.displayName','bestLap.car.name','bestLap.carName','bestCarName','fastestCarName'
      ]), cars(combo)[0] || 'Coche sin identificar');

      const lastMs = (combo) => {
        const direct = pick(combo, ['lastSeenTimestamp','latestLap.timestamp','latestLap.timestampIso']);
        if (typeof direct === 'number') return direct > 20000000000 ? direct : direct * 1000;
        if (direct) {
          const parsed = Date.parse(String(direct));
          if (Number.isFinite(parsed)) return parsed;
        }
        const raw = pick(combo, ['lastSeenAt','lastActivityIso','latestLapAt','updatedAt']);
        if (!raw) return 0;
        const parsed = Date.parse(String(raw));
        return Number.isFinite(parsed) ? parsed : 0;
      };

      const formatDate = (combo) => {
        const ms = lastMs(combo);
        if (!ms) return 'Sin fecha';
        return new Date(ms).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      };

      const carLine = (combo) => {
        const list = cars(combo);
        if (!list.length) return 'Paquete de coches por confirmar';
        const shown = list.slice(0, 2).join(' + ');
        const rest = list.length > 2 ? \` + \${list.length - 2} más\` : '';
        return \`\${list.length} \${list.length === 1 ? 'coche permitido' : 'coches permitidos'} · \${shown}\${rest}\`;
      };

      const fastestSummary = (combo) => \`\${bestDriver(combo)} - \${bestCar(combo)} - \${bestTime(combo)}\`;

      const slugify = (value) => normalize(value)
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

      const imageCandidates = (combo) => {
        const track = displayTrack(combo);
        const helper = window.GCTrackImages;
        if (helper?.candidates) return helper.candidates(track).filter((url) => !url.includes('object_object'));
        const slug = slugify(track);
        return [
          \`/images/tracks/\${slug}.webp\`,
          \`/images/tracks/\${slug}.jpg\`,
          \`/images/tracks/\${slug}.png\`
        ];
      };

      const renderBanner = (combo, label) => {
        const candidates = imageCandidates(combo);
        const primary = candidates[0] || '';
        const fallbackList = candidates.slice(1).map((item) => escapeHtml(item)).join('|');

        return \`
          <div class="gc-track-banner-v42">
            <span class="gc-track-banner-tag-v42">\${escapeHtml(label)}</span>
            <img src="\${escapeHtml(primary)}" alt="\${escapeHtml(displayTrack(combo))}" loading="lazy" data-fallbacks="\${fallbackList}" data-fallback-index="0"
              onerror="const list=(this.dataset.fallbacks||'').split('|').filter(Boolean); const i=Number(this.dataset.fallbackIndex||0); if(list[i]){this.dataset.fallbackIndex=String(i+1); this.src=list[i];} else { this.style.display='none'; }" />
          </div>
        \`;
      };

      const renderFeatureCard = (combo, label, target) => {
        if (!target) return;

        if (!combo) {
          target.innerHTML = '<div class="gc-empty-card-v42">Sin datos suficientes desde Data Core.</div>';
          return;
        }

        target.innerHTML = \`
          \${renderBanner(combo, label)}
          <div class="gc-feature-body-v42">
            <div>
              <h3>\${escapeHtml(displayTrack(combo))}</h3>
              <p class="gc-fastest-line-v52">
                <span>Mejor referencia</span>
                <strong>\${escapeHtml(fastestSummary(combo))}</strong>
              </p>
              <p class="gc-car-summary-line-v52">\${escapeHtml(carLine(combo))}</p>
            </div>
            <div>
              <div class="gc-stats-row-v42">
                <span class="gc-stat-badge-v42"><span>Vueltas</span>\${escapeHtml(formatNumber(totalLaps(combo)))}</span>
                <span class="gc-stat-badge-v42"><span>Pilotos</span>\${escapeHtml(formatNumber(driversCount(combo)))}</span>
                <span class="gc-stat-badge-v42"><span>Limpias</span>\${escapeHtml(String(cleanRate(combo)))}%</span>
              </div>
              <div class="gc-stats-row-v42" style="margin-top:8px">
                <a class="gc-btn gc-btn--primary" href="\${escapeHtml(comboUrl(combo))}">Abrir ficha</a>
              </div>
            </div>
          </div>
        \`;
      };

      const renderCard = (combo, index) => \`
        <article class="gc-combo-card-v42">
          \${renderBanner(combo, \`Combo \${index + 1}\`)}
          <div class="gc-card-body-v42">
            <div>
              <span class="gc-kicker">Combo \${index + 1}</span>
              <h3>\${escapeHtml(displayTrack(combo))}</h3>
              <p class="gc-fastest-line-v52">
                <span>Más rápido</span>
                <strong>\${escapeHtml(fastestSummary(combo))}</strong>
              </p>
              <p class="gc-car-summary-line-v52">\${escapeHtml(carLine(combo))}</p>
              <p class="gc-combo-activity-line-v46"><span>Última actividad</span><strong>\${escapeHtml(formatDate(combo))}</strong></p>
            </div>
            <div>
              <div class="gc-stats-row-v42">
                <span class="gc-stat-badge-v42"><span>Vueltas</span>\${escapeHtml(formatNumber(totalLaps(combo)))}</span>
                <span class="gc-stat-badge-v42"><span>Pilotos</span>\${escapeHtml(formatNumber(driversCount(combo)))}</span>
                <span class="gc-stat-badge-v42"><span>Coches</span>\${escapeHtml(String(cars(combo).length))}</span>
              </div>
              <div class="gc-stats-row-v42" style="margin-top:8px">
                <a class="gc-btn gc-btn--primary" href="\${escapeHtml(comboUrl(combo))}">Abrir ficha</a>
              </div>
            </div>
          </div>
        </article>
      \`;

      const searchText = (combo) => [
        displayTrack(combo),
        ...cars(combo),
        comboId(combo),
        combo?.carSummary,
        combo?.usedCarSummary
      ].join(' ').toLowerCase();

      const passesActivity = (combo) => {
        const value = els.activity?.value || 'all';
        if (value === 'all') return true;
        if (value === 'active') return totalLaps(combo) > 0;

        const days = Number(value);
        if (!Number.isFinite(days)) return true;
        return lastMs(combo) >= (Date.now() - days * 24 * 60 * 60 * 1000);
      };

      const sortRows = (rows) => {
        const mode = els.sort?.value || 'recent';
        return [...rows].sort((a, b) => {
          if (mode === 'laps') return totalLaps(b) - totalLaps(a);
          if (mode === 'drivers') return driversCount(b) - driversCount(a);
          if (mode === 'clean') return cleanRate(b) - cleanRate(a);
          if (mode === 'fastest') return bestMs(a) - bestMs(b);
          if (mode === 'cars') return cars(b).length - cars(a).length;
          return lastMs(b) - lastMs(a);
        });
      };

      const visibleRows = () => {
        const query = normalize(els.search?.value || '');
        return sortRows(coreCombos.filter((combo) => {
          if (query && !normalize(searchText(combo)).includes(query)) return false;
          if (!passesActivity(combo)) return false;
          return true;
        }));
      };

      function drawCore() {
        const rows = visibleRows();
        const shown = rows.slice(0, visibleLimit);

        setText(els.total, formatNumber(coreCombos.length));
        setText(els.visible, formatNumber(rows.length));
        setText(els.sortLabel, els.sort?.selectedOptions?.[0]?.textContent || 'Actividad reciente');
        setText(els.updated, new Date().toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' }));

        setText(els.metricCombos, formatNumber(coreSummary?.totalCombos ?? coreCombos.length));
        setText(els.metricActive, formatNumber(coreSummary?.activeCombos ?? coreCombos.filter((combo) => totalLaps(combo) > 0).length));
        setText(els.metricLaps, formatNumber(coreSummary?.totalLaps ?? coreCombos.reduce((sum, combo) => sum + totalLaps(combo), 0)));

        const uniqueCars = new Set();
        coreCombos.forEach((combo) => cars(combo).forEach((car) => uniqueCars.add(normalize(car))));
        setText(els.metricCars, formatNumber(coreSummary?.carsCount ?? uniqueCars.size));

        const mostRecent = [...coreCombos].filter((combo) => totalLaps(combo) > 0).sort((a, b) => lastMs(b) - lastMs(a))[0];
        const mostLaps = [...coreCombos].sort((a, b) => totalLaps(b) - totalLaps(a))[0];
        const cleanest = [...coreCombos].filter((combo) => totalLaps(combo) >= 1).sort((a, b) => cleanRate(b) - cleanRate(a) || totalLaps(b) - totalLaps(a))[0];

        renderFeatureCard(mostRecent, 'Combo activo', els.recent);
        renderFeatureCard(mostLaps, 'Más rodado', els.laps);
        renderFeatureCard(cleanest, 'Más limpio', els.clean);

        if (els.cardsMeta) {
          els.cardsMeta.textContent = \`\${formatNumber(rows.length)} combos visibles de \${formatNumber(coreCombos.length)} · Data Core\`;
        }

        els.cards.innerHTML = shown.length
          ? shown.map(renderCard).join('')
          : '<article class="gc-combo-card-v42"><div class="gc-empty-card-v42">Sin combos con esos filtros · Data Core.</div></article>';

        if (els.loadMore) {
          els.loadMore.hidden = shown.length >= rows.length;
        }

        document.documentElement.dataset.gcCombosDataCore = 'true';

        console.info('[GC /combos Data Core Bridge v1]', {
          loaded: coreCombos.length,
          visible: rows.length,
          summary: coreSummary
        });
      }

      async function fetchCoreJson(url) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 9000);

        try {
          const response = await fetch(url, { credentials:'include', cache:'no-store', signal:controller.signal });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data) throw new Error(\`\${url} \${response.status}\`);
          return data;
        } finally {
          window.clearTimeout(timeout);
        }
      }

      async function loadCore() {
        if (els.reload) els.reload.disabled = true;
        if (els.cards) els.cards.innerHTML = '<article class="gc-combo-card-v42"><p>Cargando combos desde Data Core...</p></article>';

        try {
          const data = await fetchCoreJson('/api/gc/combos?limit=1000&sort=recent');
          coreCombos = items(data);
          coreSummary = data;
          visibleLimit = 12;

          drawCore();
        } catch (error) {
          console.warn('[GC /combos Data Core Bridge v1] Core unavailable, legacy combos remain active:', error);
          document.documentElement.dataset.gcCombosDataCore = 'fallback';
        } finally {
          if (els.reload) els.reload.disabled = false;
        }
      }

      [els.search, els.activity, els.sort].forEach((input) => {
        input?.addEventListener('input', drawCore);
        input?.addEventListener('change', drawCore);
      });

      els.loadMore?.addEventListener('click', () => {
        visibleLimit += 12;
        drawCore();
      });

      els.reload?.addEventListener('click', () => {
        window.setTimeout(loadCore, 700);
      });

      els.clear?.addEventListener('click', () => {
        if (els.search) els.search.value = '';
        if (els.activity) els.activity.value = 'all';
        if (els.sort) els.sort.value = 'recent';
        visibleLimit = 12;
        drawCore();
      });

      window.addEventListener('load', () => {
        window.setTimeout(loadCore, 900);
      });
    })();
    ${UI_END}
  </script>
`;

const replacedCombos = replaceBetween(combos, UI_START, UI_END, bridgeBlock);
if (replacedCombos !== null) {
  combos = replacedCombos;
} else {
  combos = insertBeforeLast(combos, '</AppLayout>', bridgeBlock, '/combos UI bridge');
}

fs.writeFileSync(combosPath, combos, 'utf8');
console.log('[GC COMBOS CORE] Added/updated /combos Data Core bridge.');
console.log('[GC COMBOS CORE] Run: npm run build');
