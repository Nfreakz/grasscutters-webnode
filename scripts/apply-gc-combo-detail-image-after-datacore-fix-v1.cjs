#!/usr/bin/env node
/* GC_COMBO_DETAIL_IMAGE_AFTER_DATACORE_FIX_V1_APPLY
 * Hardens combo detail track image after Data Core primary patch.
 * Does not touch endpoints or data logic.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const comboDetailPath = path.join(root, 'src', 'pages', 'combos', '[comboId].astro');

if (!fs.existsSync(comboDetailPath)) {
  console.error('[GC COMBO DETAIL IMAGE AFTER CORE] Missing src/pages/combos/[comboId].astro');
  process.exit(1);
}

let source = fs.readFileSync(comboDetailPath, 'utf8');

// 1) Remove old conflicting helper from combo detail. The old helper can overwrite window.GCTrackImages.
source = source.replace(/\n?\s*<script is:inline src="\/js\/gc-track-images\.js"><\/script>/g, '');

// 2) Ensure the fuzzy resolver is loaded once.
if (!source.includes('/js/gc-track-image.js')) {
  const scriptAnchor = '<script>';
  if (!source.includes(scriptAnchor)) {
    console.error('[GC COMBO DETAIL IMAGE AFTER CORE] Could not find script anchor.');
    process.exit(1);
  }
  source = source.replace(scriptAnchor, '  <script is:inline src="/js/gc-track-image.js"></script>\n  ' + scriptAnchor);
}

// 3) Replace renderTrackImage with a final robust version.
const startNeedle = '    async function renderTrackImage(trackName) {';
let start = source.indexOf(startNeedle);

if (start === -1) {
  start = source.indexOf('    function renderTrackImage(trackName) {');
}

if (start === -1) {
  console.error('[GC COMBO DETAIL IMAGE AFTER CORE] renderTrackImage() not found.');
  process.exit(1);
}

const nextAnchor = '\n    function cleanCarName';
const end = source.indexOf(nextAnchor, start);
if (end === -1 || end <= start) {
  console.error('[GC COMBO DETAIL IMAGE AFTER CORE] cleanCarName anchor not found.');
  process.exit(1);
}

const newRenderTrackImage = `    async function renderTrackImage(trackName) {
      const clean = cleanTrackText(trackName);

      if (!els.trackImage || !els.trackFigure) return;

      if (!clean) {
        els.trackFigure.hidden = true;
        return;
      }

      els.trackFigure.hidden = false;
      els.trackImage.style.display = '';
      els.trackImage.alt = clean;
      els.trackImage.dataset.trackName = clean;
      els.trackImage.dataset.gcTrackName = clean;

      const localPlaceholder = () => {
        const safe = clean.replace(/[<>&'"]/g, '');
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">' +
          '<rect width="1200" height="675" fill="#071506"/>' +
          '<circle cx="930" cy="90" r="260" fill="#89ff35" opacity=".12"/>' +
          '<path d="M-40 535 C 180 420, 300 420, 500 530 S 830 680, 1240 430" fill="none" stroke="#b4ff73" stroke-width="3" opacity=".22"/>' +
          '<text x="64" y="120" fill="#9dff47" font-size="42" font-family="Arial" font-weight="800">GrassCutters</text>' +
          '<text x="64" y="185" fill="#f1ffe8" font-size="38" font-family="Arial" font-weight="800">' + safe + '</text>' +
          '<text x="64" y="235" fill="#afc6a2" font-size="24" font-family="Arial">Track image pending</text>' +
          '</svg>'
        );
      };

      try {
        await window.GCTrackImages?.load?.();

        let src = null;
        let sourceType = 'placeholder';
        let matchedFile = null;
        let matchedScore = null;

        const match = window.GCTrackImages?.bestAsset?.(clean);
        if (match?.url) {
          src = match.url;
          sourceType = 'fuzzy';
          matchedFile = match.file || null;
          matchedScore = match.score || null;
        }

        if (!src && window.GCTrackImages?.candidates) {
          const candidates = window.GCTrackImages.candidates(clean).filter(Boolean);
          src = candidates[0] || null;
          sourceType = src && !src.startsWith('data:') ? 'candidate' : 'placeholder';
        }

        if (!src && window.GCTrackImages?.placeholderUrl) {
          src = window.GCTrackImages.placeholderUrl(clean);
          sourceType = 'placeholder';
        }

        if (!src) {
          src = localPlaceholder();
          sourceType = 'local-placeholder';
        }

        els.trackImage.onerror = function () {
          this.onerror = null;
          this.src = window.GCTrackImages?.placeholderUrl?.(clean) || localPlaceholder();
          this.dataset.gcTrackImageSource = 'placeholder-after-error';
        };

        els.trackImage.src = src;
        els.trackImage.dataset.gcTrackImageSource = sourceType;
        els.trackImage.dataset.gcTrackImageFile = matchedFile || '';
        els.trackImage.dataset.gcTrackImageScore = matchedScore ? String(matchedScore) : '';

        console.info('[GC combo detail image hardened v1]', {
          trackName: clean,
          source: sourceType,
          file: matchedFile,
          score: matchedScore,
          src
        });
      } catch (error) {
        console.warn('[GC combo detail image hardened v1] fallback', error);
        els.trackImage.onerror = null;
        els.trackImage.src = localPlaceholder();
        els.trackImage.dataset.gcTrackImageSource = 'local-placeholder-error';
      }
    }

`;

source = source.slice(0, start) + newRenderTrackImage + source.slice(end + 1);

// 4) Ensure renderTrackImage is called after Data Core and after page settles.
source = source.replace(
  /renderTrackImage\(trackName\);\s*(?:window\.setTimeout\(\(\) => renderTrackImage\(trackName\), 450\);)?/g,
  "await renderTrackImage(trackName);\n        window.setTimeout(() => renderTrackImage(trackName), 450);\n        window.setTimeout(() => renderTrackImage(trackName), 1500);"
);

// 5) Update marker.
const oldMarkerStart = '/* GC_COMBO_DETAIL_TRACK_IMAGE_FUZZY_FIX_V1_MARKER */';
const newMarker = '/* GC_COMBO_DETAIL_IMAGE_AFTER_DATACORE_FIX_V1_MARKER */';

if (source.includes(oldMarkerStart)) {
  source = source.replace(oldMarkerStart, newMarker);
  source = source.replace("document.documentElement.dataset.gcComboDetailTrackImage = 'fuzzy-v1';", "document.documentElement.dataset.gcComboDetailTrackImage = 'hardened-v1';");
} else if (!source.includes(newMarker)) {
  const markerScript = `
  <script is:inline>
    ${newMarker}
    document.documentElement.dataset.gcComboDetailTrackImage = 'hardened-v1';
  </script>
`;
  const anchor = '</AppLayout>';
  const index = source.lastIndexOf(anchor);
  if (index !== -1) source = source.slice(0, index) + markerScript + '\n' + source.slice(index);
}

fs.writeFileSync(comboDetailPath, source, 'utf8');

console.log('[GC COMBO DETAIL IMAGE AFTER CORE] Hardened combo detail track image.');
console.log('[GC COMBO DETAIL IMAGE AFTER CORE] Removed old /js/gc-track-images.js from combo detail.');
console.log('[GC COMBO DETAIL IMAGE AFTER CORE] Run: npm run build');
