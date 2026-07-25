import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_PILOT_POPOVER_RANK_NAMES_PODIUMS_V1_3_1';
const file = path.join(process.cwd(), 'src', 'pages', 'index.astro');

if (!fs.existsSync(file)) {
  console.error(`[${PACK}] No existe: ${file}`);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

if (!src.includes('GC_HOME_PILOT_POPOVER_PROPOSAL_A_V1_1')) {
  console.error(`[${PACK}] No se detecta la V1.1 del popup.`);
  process.exit(2);
}

if (src.includes(PACK)) {
  console.log(`[${PACK}] Ya estaba aplicado.`);
  process.exit(0);
}

const backupDir = path.join(process.cwd(), '_gc_backups', PACK);
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, `index.astro.${Date.now()}.bak`);
fs.copyFileSync(file, backup);

/*
 * Sustituimos la función completa de render del popup.
 * Esto evita depender de textos o espacios exactos de versiones anteriores.
 */
const functionPattern =
  /const popoverMarkup = \(pilot: PilotRow\): string => \{[\s\S]*?\n\s*\};\n\s*\n\s*const placePopover/;

if (!functionPattern.test(src)) {
  console.error(`[${PACK}] No se encontró popoverMarkup().`);
  process.exit(3);
}

const replacement = `const popoverMarkup = (pilot: PilotRow): string => {
        const data = pilot as any;
        const id = pilotId(pilot);
        const name = pilotName(pilot);
        const avatar = text(
          pilot.avatarUrl,
          id ? \`/api/pilot-avatar/\${encodeURIComponent(id)}\` : DEFAULT_AVATAR
        );

        const sessions = pilot.sessionsCount ?? pilot.races;
        const laps = pilot.totalLaps;
        const hours = pilot.totalHours;
        const active = pilot.active30dLaps;
        const clean = Number(pilot.cleanRate);
        const cleanText = Number.isFinite(clean)
          ? \`\${numberText(clean,1)}%\`
          : '--';

        const srScore = Number(pilot.srScore);
        const gsrScore = Number(pilot.gsrScore);

        const srRank = !Number.isFinite(srScore) ? '--'
          : srScore >= 95 ? 'LEGEND'
          : srScore >= 90 ? 'ELITE'
          : srScore >= 80 ? 'PRO'
          : srScore >= 70 ? 'ADVANCED'
          : srScore >= 60 ? 'ROOKIE'
          : 'PITLANE';

        const gsrRank = !Number.isFinite(gsrScore) ? '--'
          : gsrScore >= 1750 ? 'DIAMOND'
          : gsrScore >= 1650 ? 'RUBY'
          : gsrScore >= 1550 ? 'SAPPHIRE'
          : gsrScore >= 1475 ? 'EMERALD'
          : gsrScore >= 1400 ? 'AMBER'
          : 'ONYX';

        const directPodiums =
          data.podiums ??
          data.podiumCount ??
          data.podiumsCount ??
          data.totalPodiums ??
          data.stats?.podiums ??
          data.stats?.podiumCount ??
          data.stats?.podiumsCount ??
          data.stats?.totalPodiums ??
          data.results?.podiums ??
          data.career?.podiums;

        const wins = Number(
          data.wins ??
          data.victories ??
          data.firstPlaces ??
          data.stats?.wins ??
          data.stats?.victories
        );
        const seconds = Number(
          data.secondPlaces ??
          data.seconds ??
          data.p2 ??
          data.stats?.secondPlaces
        );
        const thirds = Number(
          data.thirdPlaces ??
          data.thirds ??
          data.p3 ??
          data.stats?.thirdPlaces
        );

        let podiums: unknown = directPodiums;
        if (
          (podiums === undefined || podiums === null || podiums === '') &&
          [wins,seconds,thirds].some(Number.isFinite)
        ) {
          podiums =
            (Number.isFinite(wins) ? wins : 0) +
            (Number.isFinite(seconds) ? seconds : 0) +
            (Number.isFinite(thirds) ? thirds : 0);
        }

        return \`
          <div class="gc-home-pilot-popover__head">
            <img
              class="gc-home-pilot-popover__avatar"
              src="\${escapeHtml(avatar)}"
              alt=""
              width="76"
              height="76"
              onerror="this.onerror=null;this.src='\${DEFAULT_AVATAR}'"
            />
            <div class="gc-home-pilot-popover__identity">
              <span class="gc-home-pilot-popover__eyebrow">Ficha rápida de piloto</span>
              <strong class="gc-home-pilot-popover__name">\${escapeHtml(name)}</strong>
              <span class="gc-home-pilot-popover__team">\${escapeHtml(text(pilot.team,'GrassCutters Racing'))}</span>
            </div>
            <button
              class="gc-home-pilot-popover__close"
              type="button"
              aria-label="Cerrar ficha rápida"
              data-home-pilot-popover-close
            >×</button>
          </div>

          <div class="gc-home-pilot-popover__ratings">
            <div class="gc-home-pilot-popover__rating">
              <span>\${escapeHtml(srRank)}</span>
              <strong>\${escapeHtml(numberText(pilot.srScore,1))}</strong>
            </div>

            <div class="gc-home-pilot-popover__rating">
              <span>\${escapeHtml(gsrRank)}</span>
              <strong>\${escapeHtml(numberText(pilot.gsrScore,0))}</strong>
            </div>
          </div>

          <div class="gc-home-pilot-popover__stats">
            <div class="gc-home-pilot-popover__stat">
              <span>Vueltas vál.</span>
              <strong>\${escapeHtml(numberText(data.validLaps ?? data.validLapsCount ?? data.stats?.validLaps))}</strong>
            </div>

            <div class="gc-home-pilot-popover__stat">
              <span>Vueltas</span>
              <strong>\${escapeHtml(numberText(laps))}</strong>
            </div>

            <div class="gc-home-pilot-popover__stat">
              <span>Horas</span>
              <strong>\${escapeHtml(numberText(hours,1))}</strong>
            </div>

            <div class="gc-home-pilot-popover__stat">
              <span>Activas 30d</span>
              <strong>\${escapeHtml(numberText(active))}</strong>
            </div>

            <div class="gc-home-pilot-popover__stat">
              <span>Limpieza</span>
              <strong>\${escapeHtml(cleanText)}</strong>
            </div>

            <div class="gc-home-pilot-popover__stat">
              <span>Podios</span>
              <strong>\${escapeHtml(numberText(podiums))}</strong>
            </div>
          </div>

          <div class="gc-home-pilot-popover__favorites">
            <span>Coche habitual: <strong>\${escapeHtml(text(pilot.favoriteCar))}</strong></span>
            <span>Circuito habitual: <strong>\${escapeHtml(text(pilot.favoriteTrack))}</strong></span>
          </div>

          <div class="gc-home-pilot-popover__footer">
            <span>Datos consolidados de la plataforma</span>
            <a href="/pilotos/\${encodeURIComponent(id)}">Ver ficha completa →</a>
          </div>
        \`;
      };

      const placePopover`;

src = src.replace(functionPattern, replacement);

/* Estilo final para nombres largos como SAPPHIRE o ADVANCED. */
const css = `
  /* ${PACK} */
  .gc-home-pilot-popover__rating {
    grid-template-columns: minmax(112px,1fr) auto !important;
  }

  .gc-home-pilot-popover__rating > span {
    justify-content: flex-start !important;
    overflow: hidden !important;
    font-size: 10px !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  .gc-home-pilot-popover__rating > strong {
    min-width: 76px !important;
  }
`;

const close = '</style>';
const pos = src.lastIndexOf(close);
if (pos < 0) {
  console.error(`[${PACK}] No se encontró </style>.`);
  process.exit(4);
}

src = src.slice(0, pos) + css + '\n' + src.slice(pos);
fs.writeFileSync(file, src, 'utf8');

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] SR/GSR sustituidos por rangos reales.`);
console.log(`[${PACK}] Circuitos sustituido por Podios.`);
console.log(`[${PACK}] Backup: ${backup}`);
console.log(`[${PACK}] Ejecuta npm run deps:baseline && npm run quality`);
