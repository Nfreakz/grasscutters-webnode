import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_PILOT_POPOVER_RANK_NAMES_PODIUMS_V1_3';
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

/* 1. Añadir posibles campos de podios al tipo local. */
src = src.replace(
  `        cleanRate?: unknown;
      };`,
  `        cleanRate?: unknown;
        podiums?: unknown;
        podiumCount?: unknown;
        totalPodiums?: unknown;
        podiumsCount?: unknown;
        stats?: {
          podiums?: unknown;
          podiumCount?: unknown;
          totalPodiums?: unknown;
        };
      };`
);

/* 2. Sustituir el helper antiguo por nombres públicos basados en los rangos oficiales. */
const oldRatingHelper = `      const ratingText = (
        cls: unknown,
        score: unknown,
        digits = 0
      ): string => {
        const classText = text(cls,'--');
        const scoreText = numberText(score,digits);
        return scoreText === '--' ? classText : \`\${classText} · \${scoreText}\`;
      };`;

const newRatingHelper = `      /* ${PACK} */
      const srRankName = (score: unknown): string => {
        const value = Number(score);
        if (!Number.isFinite(value)) return '--';
        if (value >= 95) return 'LEGEND';
        if (value >= 90) return 'ELITE';
        if (value >= 80) return 'PRO';
        if (value >= 70) return 'ADVANCED';
        if (value >= 60) return 'ROOKIE';
        return 'PITLANE';
      };

      const gsrRankName = (score: unknown): string => {
        const value = Number(score);
        if (!Number.isFinite(value)) return '--';
        if (value >= 1750) return 'DIAMOND';
        if (value >= 1650) return 'RUBY';
        if (value >= 1550) return 'SAPPHIRE';
        if (value >= 1475) return 'EMERALD';
        if (value >= 1400) return 'AMBER';
        return 'ONYX';
      };

      const podiumValue = (pilot: PilotRow): unknown =>
        pilot.podiums ??
        pilot.podiumCount ??
        pilot.totalPodiums ??
        pilot.podiumsCount ??
        pilot.stats?.podiums ??
        pilot.stats?.podiumCount ??
        pilot.stats?.totalPodiums;`;

if (!src.includes(oldRatingHelper)) {
  console.error(`[${PACK}] No se encontró ratingText().`);
  process.exit(3);
}
src = src.replace(oldRatingHelper, newRatingHelper);

/* 3. Calcular podios dentro del markup. */
const cleanAnchor = `        const cleanText = Number.isFinite(clean) ? \`\${numberText(clean,1)}%\` : '--';`;

if (!src.includes(cleanAnchor)) {
  console.error(`[${PACK}] No se encontró el cálculo de limpieza.`);
  process.exit(4);
}

src = src.replace(
  cleanAnchor,
  `${cleanAnchor}
        const podiums = podiumValue(pilot);`
);

/* 4. Cambiar SR/GSR por el nombre de rango y dejar la puntuación como valor. */
src = src.replace(
  `<span>SR</span>
              <strong>\${escapeHtml(ratingText(pilot.srClass,pilot.srScore,1))}</strong>`,
  `<span>\${escapeHtml(srRankName(pilot.srScore))}</span>
              <strong>\${escapeHtml(numberText(pilot.srScore,1))}</strong>`
);

src = src.replace(
  `<span>GSR</span>
              <strong>\${escapeHtml(ratingText(pilot.gsrClass,pilot.gsrScore,0))}</strong>`,
  `<span>\${escapeHtml(gsrRankName(pilot.gsrScore))}</span>
              <strong>\${escapeHtml(numberText(pilot.gsrScore,0))}</strong>`
);

/* 5. Sustituir Circuitos o ID por Podios de forma tolerante. */
const statPatterns = [
  /<div class="gc-home-pilot-popover__stat">\s*<span>Circuitos<\/span>\s*<strong>\$\{escapeHtml\([^}]+\)\}<\/strong>\s*<\/div>/,
  /<div class="gc-home-pilot-popover__stat">\s*<span>ID<\/span>\s*<strong>\$\{escapeHtml\(id\)\}<\/strong>\s*<\/div>/
];

let replacedStat = false;
for (const pattern of statPatterns) {
  if (pattern.test(src)) {
    src = src.replace(
      pattern,
      `<div class="gc-home-pilot-popover__stat">
              <span>Podios</span>
              <strong>\${escapeHtml(numberText(podiums))}</strong>
            </div>`
    );
    replacedStat = true;
    break;
  }
}

if (!replacedStat) {
  console.error(`[${PACK}] No se encontró la estadística Circuitos/ID.`);
  process.exit(5);
}

/* 6. Afinar las badges para nombres más largos. */
const css = `
  /* ${PACK} */
  .gc-home-pilot-popover__rating {
    grid-template-columns: minmax(110px, 1fr) auto !important;
  }

  .gc-home-pilot-popover__rating > span {
    justify-content: flex-start !important;
    overflow: hidden !important;
    font-size: 10px !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  .gc-home-pilot-popover__rating > strong {
    min-width: 74px !important;
    font-size: 26px !important;
  }

  @media (max-width: 430px) {
    .gc-home-pilot-popover__rating {
      grid-template-columns: minmax(100px, 1fr) auto !important;
    }

    .gc-home-pilot-popover__rating > strong {
      font-size: 22px !important;
    }
  }
`;

const close = '</style>';
const pos = src.lastIndexOf(close);
if (pos < 0) {
  console.error(`[${PACK}] No se encontró </style>.`);
  process.exit(6);
}

src = src.slice(0, pos) + css + '\n' + src.slice(pos);
fs.writeFileSync(file, src, 'utf8');

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] SR/GSR sustituidos por nombres de rango.`);
console.log(`[${PACK}] Circuitos/ID sustituido por Podios.`);
console.log(`[${PACK}] Backup: ${backup}`);
