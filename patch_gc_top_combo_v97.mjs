import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
  path.join(root, 'src/pages/index.astro'),
  path.join(root, 'src/pages/home2.astro'),
];
const cssFile = path.join(root, 'src/styles/home2.css');

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`No existe: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.writeFileSync(file, content, 'utf8');
  console.log(`OK ${path.relative(root, file)}`);
}

const helper = `

      // GC_TOP_COMBO_HOME_SUMMARY_SOURCE_V97
      // Este bloque pinta "Mejores tiempos" exclusivamente desde /api/gc/home-summary.
      // No filtra de nuevo contra endpoints legacy ni conserva datos previos: si no hay datos, muestra --.
      const renderComboRankingFromHomeSummary = (payload, trackName = '', activeCars = []) => {
        const host = $('[data-home2-combo-ranking]');
        if (!host) return [];

        const rows = Array.isArray(payload?.topComboTimes) ? payload.topComboTimes : [];
        const cleanRows = rows
          .filter(Boolean)
          .filter((lap) => {
            const ms = Number(firstValue(lap, ['lapTimeMs', 'lapMs', 'timeMs']));
            const formatted = firstValue(lap, ['lapTimeFormatted', 'lapTime', 'timeFormatted', 'bestLap']);
            return (Number.isFinite(ms) && ms > 0) || Boolean(formatted);
          })
          .slice(0, 5);

        if (!cleanRows.length) {
          syncBestFromRow({ driverName: '--', carName: activeCars?.[0] || '--', lapTimeFormatted: '--', lapTime: '--' });
          host.innerHTML = [1, 2, 3, 4, 5].map((position) => `
            <div class="gc-home2-combo-rank gc-home2-combo-rank--loading">
              <span class="gc-home2-rank-badge gc-home2-rank-badge--plain">${position}</span>
              <div><strong>--</strong><small>${payload?.syncRequired ? 'Sin sync SQL mirror' : 'Sin tiempo válido'}</small></div>
              <img class="gc-home2-combo-rank__avatar" src="/images/pilot-avatar-default.png" alt="" width="24" height="24" loading="lazy" decoding="async" />
              <em>--</em>
            </div>
          `).join('');
          return [];
        }

        syncBestFromRow(cleanRows[0]);

        host.innerHTML = cleanRows.map((lap, index) => {
          const driver = firstValue(lap, ['driverName', 'pilotName', 'playerName', 'name', 'driver.displayName', 'driver.name', 'player.name']) || 'Piloto';
          const car = firstValue(lap, ['carName', 'car', 'carDisplayName', 'vehicle', 'car.displayName', 'car.name']) || activeCars?.[0] || 'Coche';
          const rawTime = firstValue(lap, ['lapTimeFormatted', 'timeFormatted', 'formattedLapTime', 'lapTime', 'lapMs', 'time', 'bestLap', 'bestLapTime']);
          const avatar = pilotAvatarUrl(lap);
          return `
            <div class="gc-home2-combo-rank ${index >= 3 ? 'gc-home2-combo-rank--compact' : ''}" data-home2-top-combo-source="home-summary">
              ${comboRankBadge(index)}
              <div><strong>${escapeAttr(driver)}</strong><small>${escapeAttr(car)}</small></div>
              <img class="gc-home2-combo-rank__avatar" src="${escapeAttr(avatar)}" alt="" width="24" height="24" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/images/pilot-avatar-default.png';" />
              <em>${escapeAttr(formatLap(rawTime) || '--')}</em>
            </div>
          `;
        }).join('');

        return cleanRows;
      };
`;

for (const file of files) {
  let content = read(file);
  let changed = false;

  if (!content.includes('GC_TOP_COMBO_HOME_SUMMARY_SOURCE_V97')) {
    const marker = `        return cleanRows;\n      };\n\n\n\n      const escapeAttr`;
    if (!content.includes(marker)) {
      throw new Error(`No encuentro el punto de inserción renderComboRanking en ${file}`);
    }
    content = content.replace(marker, `        return cleanRows;\n      };${helper}\n\n      const escapeAttr`);
    changed = true;
  }

  const oldCall = `const renderedComboRankingRows = renderComboRanking(topComboTimes, track, carList, { preserveOnEmpty: false });`;
  const newCall = `const renderedComboRankingRows = renderComboRankingFromHomeSummary(homeSummaryPayload, track, carList);`;
  if (content.includes(oldCall)) {
    content = content.replace(oldCall, newCall);
    changed = true;
  }

  // Evita que futuras limpiezas vuelvan a usar el array filtrado desde endpoints legacy para este panel.
  content = content.replace(
    `console.warn('[GC Home] Top Combo vacío desde SQL mirror', {`,
    `console.warn('[GC Home] Top Combo vacío desde /api/gc/home-summary', {`
  );

  if (changed) write(file, content);
  else console.log(`Sin cambios ${path.relative(root, file)}`);
}

let css = read(cssFile);
const cssPatch = `

/* GC_TOP_COMBO_HOME_SUMMARY_SOURCE_V97
   El panel de Mejores tiempos no debe estirarse por la altura de otros paneles del grid.
   Si /api/gc/home-summary no trae datos, se mantiene compacto con placeholders --. */
.gc-home2-toprow {
  align-items: start;
}

.gc-home2-panel--combo-ranking {
  align-self: start;
  min-height: 0;
}

.gc-home2-combo-ranking-list {
  min-height: 0;
}

.gc-home2-combo-rank--loading,
.gc-home2-combo-rank--empty {
  min-height: 40px;
}

.gc-home2-combo-rank__avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}
`;
if (!css.includes('GC_TOP_COMBO_HOME_SUMMARY_SOURCE_V97')) {
  css += cssPatch;
  write(cssFile, css);
} else {
  console.log(`Sin cambios ${path.relative(root, cssFile)}`);
}

console.log('\nParche v97 aplicado. Ejecuta: npm run build');
