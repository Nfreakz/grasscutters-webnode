import fs from 'node:fs';
import path from 'node:path';

const PACK = 'GC_HOME_COMBO_GLASS_ACSM_V1';
const root = process.cwd();
const target = path.join(root, 'src', 'pages', 'index.astro');

if (!fs.existsSync(target)) {
  console.error(`[${PACK}] No existe: ${target}`);
  process.exit(1);
}

let source = fs.readFileSync(target, 'utf8');

if (source.includes('GC_HOME_COMBO_GLASS_ACSM_V1')) {
  console.log(`[${PACK}] Ya estaba aplicado. No se realizan cambios.`);
  process.exit(0);
}

const backupDir = path.join(root, '_gc_backups', PACK);
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, `index.astro.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`);
fs.copyFileSync(target, backup);

const oldMarkup = `        <article class="gc-home2-combo-card" aria-labelledby="gc-home2-combo-title">
          <p class="gc-home2-combo-card__label" data-home2-hero-source>Combo activo</p>
          <h2 id="gc-home2-combo-title" data-home2-track>Actualizando</h2>
          <p class="gc-home2-combo-card__cars" data-home2-cars>Esperando datos del combo</p>

          <div class="gc-home2-combo-card__best">
            <div class="gc-home2-driver gc-home2-driver--compact">
              <div class="gc-home2-driver__avatar">
                <img data-home2-best-avatar src="/images/pilot-avatar-default.png" alt="" width="70" height="70" loading="lazy" decoding="async" />
                <span class="gc-home2-driver__dot" aria-hidden="true"></span>
              </div>
              <div class="gc-home2-driver__meta">
                <span class="gc-home2-card-label">Mejor vuelta</span>
                <strong data-home2-best-driver>--</strong>
                <small data-home2-best-car>--</small>
              </div>
            </div>
            <div class="gc-home2-combo-card__time" data-home2-best-time>--</div>
          </div>

          <a class="gc-home2-btn gc-home2-btn--primary gc-home2-combo-card__cta" href="https://acstuff.ru/s/q:race/online/join?httpPort=8381&ip=145.239.131.153" target="_blank" rel="noreferrer">
            Entrar al servidor
            <span aria-hidden="true">→</span>
          </a>
        </article>`;

const newMarkup = `        <!-- GC_HOME_COMBO_GLASS_ACSM_V1 -->
        <article class="gc-home2-combo-card gc-home2-combo-card--glass" aria-labelledby="gc-home2-combo-title" data-home2-combo-source="main">
          <div class="gc-home2-combo-card__media" aria-hidden="true">
            <img
              class="gc-home2-combo-card__track-image"
              data-home2-combo-track-image
              src="/ui/home2/gc-home2-track-fallback.svg"
              alt=""
              width="900"
              height="620"
              loading="eager"
              decoding="async"
            />
            <span class="gc-home2-combo-card__media-shade"></span>
          </div>

          <div class="gc-home2-combo-card__glass-content">
            <header class="gc-home2-combo-card__glass-head">
              <span class="gc-home2-combo-card__server-icon" aria-hidden="true">
                <i></i><i></i><i></i>
              </span>
              <p class="gc-home2-combo-card__label" data-home2-hero-source>Combo activo</p>
              <span class="gc-home2-combo-card__status"><i aria-hidden="true"></i>ACTIVO</span>
            </header>

            <div class="gc-home2-combo-card__track-copy">
              <h2 id="gc-home2-combo-title" data-home2-track>Actualizando</h2>
              <p class="gc-home2-combo-card__cars" data-home2-cars>Esperando datos del combo</p>
            </div>

            <div class="gc-home2-combo-card__best">
              <div class="gc-home2-driver gc-home2-driver--compact">
                <div class="gc-home2-driver__avatar">
                  <img data-home2-best-avatar src="/images/pilot-avatar-default.png" alt="" width="70" height="70" loading="lazy" decoding="async" />
                  <span class="gc-home2-driver__dot" aria-hidden="true"></span>
                </div>
                <div class="gc-home2-driver__meta">
                  <span class="gc-home2-card-label">Mejor vuelta</span>
                  <strong data-home2-best-driver>--</strong>
                  <small data-home2-best-car>--</small>
                </div>
              </div>
              <div class="gc-home2-combo-card__time-wrap">
                <span>Tiempo</span>
                <div class="gc-home2-combo-card__time" data-home2-best-time>--</div>
              </div>
            </div>

            <a class="gc-home2-btn gc-home2-btn--primary gc-home2-combo-card__cta" href="https://acstuff.ru/s/q:race/online/join?httpPort=8381&ip=145.239.131.153" target="_blank" rel="noreferrer">
              Entrar al servidor
              <span aria-hidden="true">→</span>
            </a>

            <div class="gc-home2-combo-card__rotation" aria-label="Rotación automática de servidores">
              <span class="is-active" data-home2-combo-state="main"><i></i>Liga</span>
              <span data-home2-combo-state="gt4"><i></i>GT4</span>
            </div>
          </div>
        </article>`;

if (!source.includes(oldMarkup)) {
  console.error(`[${PACK}] No se encontró el bloque exacto de la tarjeta. No se ha modificado nada.`);
  console.error(`[${PACK}] Backup creado en: ${backup}`);
  process.exit(2);
}
source = source.replace(oldMarkup, newMarkup);

const setHeroAnchor = `        const joinUrl = source === 'gt4' ? GT4_JOIN_URL : WEEKLY_JOIN_URL;
        setText('[data-home2-hero-source]', label);`;

const setHeroReplacement = `        const joinUrl = source === 'gt4' ? GT4_JOIN_URL : WEEKLY_JOIN_URL;

        // GC_HOME_COMBO_GLASS_ACSM_V1_RUNTIME
        const glassCard = q('.gc-home2-combo-card--glass');
        if (glassCard) {
          glassCard.dataset.home2ComboSource = source;
          glassCard.classList.toggle('is-gt4', source === 'gt4');
          glassCard.classList.toggle('is-main', source !== 'gt4');
        }
        qa('[data-home2-combo-state]').forEach((item) => {
          item.classList.toggle('is-active', item.getAttribute('data-home2-combo-state') === source);
        });
        const glassTrackImage = q('[data-home2-combo-track-image]') as HTMLImageElement | null;
        if (glassTrackImage) {
          glassCard?.classList.add('is-track-loading');
          glassTrackImage.onload = () => glassCard?.classList.remove('is-track-loading');
          setImageWithFallbacks(glassTrackImage, trackImageCandidatesFromCombo(combo), FALLBACK_TRACK);
          window.setTimeout(() => glassCard?.classList.remove('is-track-loading'), 1800);
        }

        setText('[data-home2-hero-source]', label);`;

if (!source.includes(setHeroAnchor)) {
  console.error(`[${PACK}] No se encontró el ancla de setHero(). No se ha escrito el archivo.`);
  process.exit(3);
}
source = source.replace(setHeroAnchor, setHeroReplacement);

const css = String.raw`
  <style is:global>
    /* GC_HOME_COMBO_GLASS_ACSM_V1 */
    .gc-home2-combo-card--glass {
      --gc-glass-accent: #a82be2;
      position: relative;
      isolation: isolate;
      overflow: hidden;
      min-height: 460px;
      padding: 0 !important;
      border: 1px solid color-mix(in srgb, var(--gc-glass-accent) 62%, rgba(255,255,255,.24)) !important;
      border-radius: 22px !important;
      background: #090b10 !important;
      box-shadow:
        0 24px 70px rgba(0,0,0,.48),
        0 0 0 1px rgba(255,255,255,.035) inset,
        0 0 34px color-mix(in srgb, var(--gc-glass-accent) 16%, transparent);
    }

    .gc-home2-combo-card--glass.is-gt4 {
      --gc-glass-accent: #b12cff;
    }

    .gc-home2-combo-card__media,
    .gc-home2-combo-card__media-shade,
    .gc-home2-combo-card__track-image {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .gc-home2-combo-card__track-image {
      z-index: -3;
      object-fit: cover;
      object-position: center;
      opacity: .62;
      filter: saturate(.88) contrast(1.08) brightness(.62);
      transform: scale(1.035);
      transition: opacity .38s ease, transform 1.1s ease, filter .38s ease;
    }

    .gc-home2-combo-card--glass.is-track-loading .gc-home2-combo-card__track-image {
      opacity: .18;
      transform: scale(1.07);
      filter: saturate(.6) contrast(1.05) brightness(.4) blur(4px);
    }

    .gc-home2-combo-card__media {
      z-index: -2;
      pointer-events: none;
    }

    .gc-home2-combo-card__media-shade {
      background:
        radial-gradient(circle at 84% 12%, color-mix(in srgb, var(--gc-glass-accent) 15%, transparent), transparent 38%),
        linear-gradient(180deg, rgba(5,7,11,.28) 0%, rgba(5,7,11,.47) 34%, rgba(5,7,11,.92) 76%, #07090e 100%);
    }

    .gc-home2-combo-card__glass-content {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      min-height: 460px;
      padding: 18px;
    }

    .gc-home2-combo-card__glass-head {
      display: grid;
      grid-template-columns: auto minmax(0,1fr) auto;
      align-items: center;
      gap: 11px;
      min-height: 52px;
      padding: 8px 11px;
      border: 1px solid rgba(255,255,255,.15);
      border-radius: 15px;
      background: linear-gradient(180deg, rgba(18,21,29,.78), rgba(8,10,15,.64));
      box-shadow: 0 14px 30px rgba(0,0,0,.22), inset 0 1px rgba(255,255,255,.055);
      -webkit-backdrop-filter: blur(16px) saturate(1.2);
      backdrop-filter: blur(16px) saturate(1.2);
    }

    .gc-home2-combo-card__server-icon {
      display: grid;
      place-content: center;
      gap: 3px;
      width: 34px;
      height: 34px;
      border-radius: 10px;
      color: #fff;
      background: linear-gradient(145deg, color-mix(in srgb, var(--gc-glass-accent) 80%, #fff 4%), color-mix(in srgb, var(--gc-glass-accent) 48%, #27103a));
      box-shadow: 0 8px 22px color-mix(in srgb, var(--gc-glass-accent) 26%, transparent);
    }

    .gc-home2-combo-card__server-icon i {
      display: block;
      width: 15px;
      height: 3px;
      border-radius: 10px;
      background: currentColor;
      box-shadow: 0 0 6px rgba(255,255,255,.28);
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__label {
      margin: 0;
      overflow: hidden;
      color: #f5f6f9;
      font-size: .76rem;
      font-weight: 850;
      letter-spacing: .085em;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .gc-home2-combo-card__status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #c8ffad;
      font-size: .62rem;
      font-weight: 900;
      letter-spacing: .08em;
    }

    .gc-home2-combo-card__status i {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #7cff00;
      box-shadow: 0 0 12px rgba(124,255,0,.92);
    }

    .gc-home2-combo-card__track-copy {
      margin-top: auto;
      padding: 38px 5px 20px;
      text-shadow: 0 4px 20px rgba(0,0,0,.82);
    }

    .gc-home2-combo-card--glass h2 {
      margin: 0 !important;
      color: #fff !important;
      font-size: clamp(2.3rem, 5vw, 4.1rem) !important;
      font-weight: 950 !important;
      letter-spacing: -.055em !important;
      line-height: .92 !important;
      text-transform: uppercase;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__cars {
      margin: 10px 0 0 !important;
      color: rgba(242,244,248,.78) !important;
      font-size: clamp(.92rem, 1.5vw, 1.12rem) !important;
      font-weight: 650;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__best {
      display: grid !important;
      grid-template-columns: minmax(0,1fr) auto;
      align-items: center;
      gap: 16px;
      margin: 0 !important;
      padding: 15px 16px !important;
      border: 1px solid rgba(255,255,255,.16) !important;
      border-radius: 17px !important;
      background: linear-gradient(135deg, rgba(16,20,27,.76), rgba(7,9,14,.66)) !important;
      box-shadow: 0 18px 38px rgba(0,0,0,.27), inset 0 1px rgba(255,255,255,.045);
      -webkit-backdrop-filter: blur(17px) saturate(1.16);
      backdrop-filter: blur(17px) saturate(1.16);
    }

    .gc-home2-combo-card--glass .gc-home2-driver__avatar {
      border-color: #7cff00;
      box-shadow: 0 0 0 1px rgba(124,255,0,.35), 0 0 22px rgba(124,255,0,.18);
    }

    .gc-home2-combo-card--glass .gc-home2-card-label {
      color: #7cff00 !important;
      font-size: .66rem !important;
      font-weight: 900 !important;
      letter-spacing: .1em;
      text-transform: uppercase;
    }

    .gc-home2-combo-card__time-wrap {
      min-width: 126px;
      padding-left: 16px;
      border-left: 1px solid rgba(255,255,255,.14);
      text-align: right;
    }

    .gc-home2-combo-card__time-wrap > span {
      display: block;
      margin-bottom: 4px;
      color: rgba(239,241,247,.58);
      font-size: .62rem;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__time {
      color: #bf48ff !important;
      font-family: "JetBrains Mono", "Roboto Mono", monospace;
      font-size: clamp(1.45rem, 3.2vw, 2.22rem) !important;
      font-weight: 850;
      letter-spacing: -.065em;
      text-shadow: 0 0 22px rgba(177,44,255,.34);
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__cta {
      justify-content: center;
      width: 100%;
      min-height: 50px;
      margin-top: 12px;
      border: 1px solid color-mix(in srgb, var(--gc-glass-accent) 62%, #fff 10%) !important;
      border-radius: 14px !important;
      color: #fff !important;
      background: linear-gradient(135deg, color-mix(in srgb, var(--gc-glass-accent) 88%, #59108a), color-mix(in srgb, var(--gc-glass-accent) 54%, #321043)) !important;
      box-shadow: 0 14px 30px color-mix(in srgb, var(--gc-glass-accent) 24%, transparent);
    }

    .gc-home2-combo-card--glass .gc-home2-combo-card__cta:hover {
      transform: translateY(-2px);
      box-shadow: 0 18px 38px color-mix(in srgb, var(--gc-glass-accent) 34%, transparent);
    }

    .gc-home2-combo-card__rotation {
      display: flex;
      justify-content: center;
      gap: 18px;
      min-height: 28px;
      padding-top: 10px;
      color: rgba(239,241,247,.48);
      font-size: .64rem;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .gc-home2-combo-card__rotation span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: color .25s ease, opacity .25s ease;
    }

    .gc-home2-combo-card__rotation i {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: rgba(255,255,255,.26);
      transition: background .25s ease, box-shadow .25s ease, transform .25s ease;
    }

    .gc-home2-combo-card__rotation .is-active {
      color: #e6b4ff;
    }

    .gc-home2-combo-card__rotation .is-active i {
      background: var(--gc-glass-accent);
      box-shadow: 0 0 13px color-mix(in srgb, var(--gc-glass-accent) 82%, transparent);
      transform: scale(1.25);
    }

    @media (max-width: 760px) {
      .gc-home2-combo-card--glass,
      .gc-home2-combo-card__glass-content {
        min-height: 430px;
      }

      .gc-home2-combo-card__glass-content {
        padding: 13px;
      }

      .gc-home2-combo-card__glass-head {
        grid-template-columns: auto minmax(0,1fr);
      }

      .gc-home2-combo-card__status {
        display: none;
      }

      .gc-home2-combo-card__track-copy {
        padding-top: 28px;
      }

      .gc-home2-combo-card--glass .gc-home2-combo-card__best {
        grid-template-columns: minmax(0,1fr);
        gap: 10px;
      }

      .gc-home2-combo-card__time-wrap {
        min-width: 0;
        padding: 9px 0 0;
        border-top: 1px solid rgba(255,255,255,.12);
        border-left: 0;
        text-align: left;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .gc-home2-combo-card__track-image,
      .gc-home2-combo-card--glass .gc-home2-combo-card__cta {
        transition: none !important;
      }
    }
  </style>
`;

const closing = '</MarketingLayout>';
if (!source.includes(closing)) {
  console.error(`[${PACK}] No se encontró </MarketingLayout>. No se ha escrito el archivo.`);
  process.exit(4);
}
source = source.replace(closing, `${css}\n${closing}`);

fs.writeFileSync(target, source, 'utf8');

console.log(`[${PACK}] Aplicado correctamente.`);
console.log(`[${PACK}] Archivo modificado: src/pages/index.astro`);
console.log(`[${PACK}] Backup: ${backup}`);
console.log(`[${PACK}] Siguiente paso: npm run deps:baseline && npm run quality`);
