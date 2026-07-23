import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const targetRelative = 'src/pages/index.astro';
const targetPath = path.join(root, targetRelative);
const marker = 'GC_HOME_ACSM_SESSION_END_LEADERBOARD_FALLBACK_V1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `home-acsm-session-end-leaderboard-fallback-v1-${stamp}`);
const backupPath = path.join(backupDir, targetRelative);

if (!fs.existsSync(targetPath)) {
  throw new Error(`No existe ${targetRelative}. Ejecuta este instalador desde la raíz de grasscutters-webnode.`);
}

const current = fs.readFileSync(targetPath, 'utf8');

if (current.includes(marker)) {
  console.log(`[GC Home fin de sesión] Sin cambios: ${marker} ya estaba aplicado.`);
  process.exit(0);
}

if (!current.includes('GC_PHASE4C_ACSM_LIVE_ACTIVE_COMBO_V1')) {
  throw new Error('Falta el requisito ACSM live de la portada. No se ha modificado ningún archivo.');
}

const replacements = [
  {
    label: 'versión del runtime',
    before: `const PACK = 'bootstrap-2.4-acsm-live-authoritative';`,
    after: `const PACK = 'bootstrap-2.5-acsm-session-end-fallback';`
  },
  {
    label: 'inicio de la fusión ACSM',
    before: `      const mergeBootstrapWithAcsmLive = (bootstrap: any, live: Record<string, any>) => {
        const mergeSource = (source: 'main' | 'gt4') => {
          const historical = bootstrap?.[source] || {};
          const livePayload = live[source] || null;
          if (livePayload) {
            return {`,
    after: `      /* ${marker}
       * ACSM puede limpiar Track/StoredTimes justo al cerrar una carrera. Ese
       * cambio de estado no invalida las vueltas que sTracker acaba de guardar.
       * Conservamos el último combo histórico cuando no existe un combo live y,
       * si ACSM todavía anuncia el mismo circuito pero ya no trae tiempos,
       * completamos el leaderboard con ese mismo combo. Un circuito live nuevo
       * nunca hereda las vueltas del anterior.
       */
      const comboTrackIdentity = (combo: any): { code: string; config: string; key: string } => {
        const trackCode = normalize(first(combo, [
          'track.trackCode', 'track.technicalCode', 'track.rawCode', 'track.code',
          'trackCode', 'trackRaw'
        ], ''));
        const trackConfig = normalize(first(combo, [
          'track.trackConfig', 'track.layout', 'track.variant', 'trackConfig', 'layout'
        ], ''));
        return {
          code: trackCode,
          config: trackConfig,
          key: trackCode ? \`\${trackCode}:\${trackConfig}\` : ''
        };
      };

      const mergeBootstrapWithAcsmLive = (bootstrap: any, live: Record<string, any>) => {
        const mergeSource = (source: 'main' | 'gt4') => {
          const historical = bootstrap?.[source] || {};
          const livePayload = live[source] || null;
          if (livePayload) {
            const liveRows = sourceLeaderboard(livePayload);
            const historicalRows = sourceLeaderboard(historical);
            const liveTrack = comboTrackIdentity(livePayload.activeCombo);
            const historicalTrack = comboTrackIdentity(historical.activeCombo);
            const sameTrack = Boolean(
              liveTrack.code &&
              historicalTrack.code &&
              liveTrack.code === historicalTrack.code &&
              (!liveTrack.config || !historicalTrack.config || liveTrack.config === historicalTrack.config)
            );

            if (!liveRows.length && historicalRows.length && sameTrack) {
              return {
                ...historical,
                ...livePayload,
                activeCombo: {
                  ...(historical.activeCombo || {}),
                  ...(livePayload.activeCombo || {}),
                  bestLap: historical.activeCombo?.bestLap || historicalRows[0] || null,
                  latestLap: historical.activeCombo?.latestLap || historicalRows[0] || null,
                  leaderboard: historicalRows
                },
                leaderboard: historicalRows,
                diagnostics: {
                  ...(historical.diagnostics || {}),
                  ...(livePayload.diagnostics || {}),
                  activeComboAuthority: 'acsm-live+completed-session',
                  sessionEndLeaderboardFallback: true,
                  fallbackTrackIdentity: liveTrack.key || liveTrack.code
                }
              };
            }

            return {`
  },
  {
    label: 'fallback al terminar la sesión',
    before: `          // Sin ACSM live no reutilizamos el último bucket histórico como combo actual.
          return {
            ...historical,
            activeCombo: null,
            leaderboard: [],
            diagnostics: {
              ...(historical.diagnostics || {}),
              activeComboAuthority: 'acsm-live',
              liveAvailable: false,
              staleHistoricalComboSuppressed: true
            }
          };`,
    after: `          const historicalRows = sourceLeaderboard(historical);
          if (historical?.activeCombo && historicalRows.length) {
            return {
              ...historical,
              diagnostics: {
                ...(historical.diagnostics || {}),
                activeComboAuthority: 'completed-session',
                liveAvailable: false,
                sessionEndLeaderboardFallback: true
              }
            };
          }

          // No hay todavía ni estado live ni una sesión terminada con vueltas.
          return {
            ...historical,
            activeCombo: null,
            leaderboard: [],
            diagnostics: {
              ...(historical.diagnostics || {}),
              activeComboAuthority: 'acsm-live',
              liveAvailable: false,
              staleHistoricalComboSuppressed: true,
              sessionEndLeaderboardFallback: false
            }
          };`
  },
  {
    label: 'marca de autoridad del runtime',
    before: `document.documentElement.dataset.gcHomeComboAuthority = 'acsm-live-v1';`,
    after: `document.documentElement.dataset.gcHomeComboAuthority = 'acsm-live-session-end-fallback-v1';`,
    expected: 2
  }
];

let next = current;

for (const replacement of replacements) {
  const occurrences = next.split(replacement.before).length - 1;
  const expected = replacement.expected ?? 1;
  if (occurrences !== expected) {
    throw new Error(
      `No se puede aplicar "${replacement.label}": se esperaban ${expected} coincidencias y se encontraron ${occurrences}. No se ha modificado ningún archivo.`
    );
  }
  next = next.split(replacement.before).join(replacement.after);
}

if (!next.includes(marker) || !next.includes('sessionEndLeaderboardFallback: true')) {
  throw new Error('La validación final del hotfix ha fallado. No se ha modificado ningún archivo.');
}

fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(targetPath, backupPath);
fs.writeFileSync(targetPath, next, 'utf8');

console.log('');
console.log('[GC Home fin de sesión] Hotfix instalado.');
console.log(`[GC Home fin de sesión] Backup: ${path.relative(root, backupDir)}`);
console.log(`[GC Home fin de sesión] Modificado: ${targetRelative}`);
console.log('La portada conservará las vueltas del último combo al finalizar la carrera.');
console.log('Siguiente: npm run quality && npm run build');
