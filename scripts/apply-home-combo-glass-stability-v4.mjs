import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_COMBO_GLASS_STABILITY_V4';
const file = path.join(process.cwd(), 'src', 'pages', 'index.astro');
if (!fs.existsSync(file)) process.exit(1);

let src = fs.readFileSync(file, 'utf8');
if (!src.includes('GC_HOME_COMBO_GLASS_ACSM_V1')) process.exit(2);
if (src.includes(PACK)) process.exit(0);

const backupDir = path.join(process.cwd(), '_gc_backups', PACK);
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(file, path.join(backupDir, `index.astro.${Date.now()}.bak`));

const stateAnchor = `      const lastGood: { bootstrap: any; championships: Record<string, any>; live: Record<string, any> } = { bootstrap: null, championships: {}, live: {} };`;
src = src.replace(stateAnchor, stateAnchor + `

      // GC_HOME_COMBO_GLASS_STABILITY_V4
      const failedGlassTrackAssets = new Map<string, number>();
      let lastGlassComboKey = '';
      const GLASS_ASSET_FAIL_TTL_MS = 300000;`);

const helperAnchor = `      const trackImageAliasVariants = (values: unknown[]): string[] => {`;
const helper = `
      const setGlassTrackImageStable = (img: HTMLImageElement | null, combo: any, card: HTMLElement | null): void => {
        if (!img || !combo) return;
        const source = normalize(first(combo, ['sourceKey', 'source'], 'main'));
        const trackCode = String(first(combo, ['track.trackCode', 'track.rawCode', 'track.code', 'trackCode', 'trackRaw'], '') || '').trim();
        const trackConfig = String(first(combo, ['track.trackConfig', 'track.layout', 'trackConfig', 'layout'], '') || '').trim();
        const trackName = String(first(combo, ['track.publicName', 'track.displayName', 'track.name', 'trackName'], '') || '').trim();
        const comboKey = [source, trackCode, trackConfig, trackName].map(normalize).filter(Boolean).join(':');
        if (!comboKey || comboKey === lastGlassComboKey) return;
        lastGlassComboKey = comboKey;

        const candidate = trackImageCandidatesFromCombo(combo)[0] || '';
        const heroBg = q('.gc-home2-hero__bg[data-home2-track-image]') as HTMLImageElement | null;
        const fallback = heroBg?.currentSrc || heroBg?.src || FALLBACK_TRACK;
        const failedAt = Number(failedGlassTrackAssets.get(candidate) || 0);

        if (!candidate || (failedAt && Date.now() - failedAt < GLASS_ASSET_FAIL_TTL_MS)) {
          img.onerror = null;
          img.src = fallback;
          card?.classList.remove('is-track-loading');
          return;
        }

        card?.classList.add('is-track-loading');
        const preload = new Image();
        let done = false;
        const finish = (value: string, failed: boolean) => {
          if (done) return;
          done = true;
          if (failed) failedGlassTrackAssets.set(candidate, Date.now());
          img.onerror = null;
          img.src = value;
          card?.classList.remove('is-track-loading');
        };

        const timer = window.setTimeout(() => finish(fallback, true), 2500);
        preload.onload = () => { window.clearTimeout(timer); finish(candidate, false); };
        preload.onerror = () => { window.clearTimeout(timer); finish(fallback, true); };
        preload.src = candidate;
      };

`;
src = src.replace(helperAnchor, helper + helperAnchor);

const oldBlock = `        const glassTrackImage = q('[data-home2-combo-track-image]') as HTMLImageElement | null;
        if (glassTrackImage) {
          glassCard?.classList.add('is-track-loading');
          glassTrackImage.onload = () => glassCard?.classList.remove('is-track-loading');
          setImageWithFallbacks(glassTrackImage, trackImageCandidatesFromCombo(combo), FALLBACK_TRACK);
          window.setTimeout(() => glassCard?.classList.remove('is-track-loading'), 1800);
        }`;

const newBlock = `        const glassTrackImage = q('[data-home2-combo-track-image]') as HTMLImageElement | null;
        setGlassTrackImageStable(glassTrackImage, combo, glassCard as HTMLElement | null);`;

if (!src.includes(oldBlock)) {
  console.error('No se encontró bloque de imagen Glass');
  process.exit(3);
}
src = src.replace(oldBlock, newBlock);

const css = `
    /* GC_HOME_COMBO_GLASS_STABILITY_V4 */
    .gc-home2-combo-card--glass {
      box-shadow: 0 16px 42px rgba(0,0,0,.38), 0 0 0 1px rgba(255,255,255,.03) inset !important;
    }
    .gc-home2-combo-card--glass .gc-home2-combo-card__track-image {
      transition: opacity .28s ease, transform .55s ease !important;
      will-change: auto;
    }
    .gc-home2-combo-card--glass .gc-home2-combo-card__glass-head,
    .gc-home2-combo-card--glass .gc-home2-combo-card__best,
    .gc-home2-combo-card__compact-status {
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }
    .gc-home2-combo-card--glass .gc-home2-combo-card__best {
      background: rgba(8,10,15,.88) !important;
      box-shadow: 0 10px 24px rgba(0,0,0,.22) !important;
    }
    .gc-home2-combo-card__compact-status {
      background: rgba(7,9,13,.88) !important;
    }
`;

const close = '  </style>';
const pos = src.lastIndexOf(close);
src = src.slice(0, pos) + css + '\n' + src.slice(pos);

fs.writeFileSync(file, src, 'utf8');
console.log(`[${PACK}] Aplicado correctamente.`);
