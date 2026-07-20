import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'GC_HOME_GT4_ACSM_TRACK_IMAGE_FIX_V1';
const files = {
  home: 'src/pages/index.astro',
  acsm: 'src/server/acsm-championship-routes.ts',
};
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `home-gt4-acsm-track-image-${stamp}`);
const changed = [];

function target(relativePath) {
  return path.join(root, relativePath);
}

function backup(relativePath) {
  const source = target(relativePath);
  if (!fs.existsSync(source)) return;
  const destination = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function writePreservingEol(relativePath, original, normalized) {
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const output = eol === '\n' ? normalized : normalized.replace(/\n/g, '\r\n');
  backup(relativePath);
  fs.writeFileSync(target(relativePath), output, 'utf8');
  changed.push(relativePath);
}

function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`No se encontró ${label}`);
  return text.replace(from, to);
}

for (const relativePath of Object.values(files)) {
  if (!fs.existsSync(target(relativePath))) {
    throw new Error(`No existe ${relativePath}.`);
  }
}

// Portada: conservar identidad técnica y no usar coincidencias difusas para GT4.
{
  const original = fs.readFileSync(target(files.home), 'utf8');
  let next = original.replace(/\r\n/g, '\n');

  if (!next.includes(marker)) {
    if (!next.includes('GC_HOME_CHAMPIONSHIP_LIVE_COMBO_V1')
      || !next.includes('const setChampionshipTrackImage = async')
      || !next.includes('data-home2-champ-track-image')) {
      throw new Error('src/pages/index.astro no coincide con la versión esperada.');
    }

    const oldLiveEvent = `        const liveTrack = liveCombo ? comboTrack(liveCombo, liveRows, liveSourceKey) : '';
        const liveCars = liveCombo ? comboCars(liveCombo, liveRows, liveSourceKey) : [];
        const liveEvent = liveTrack ? {
          __gcLiveCombo: true,
          trackName: liveTrack,
          track: liveTrack,
          carSummary: liveCars.join(' / ')
        } : null;`;

    const newLiveEvent = `        const liveTrack = liveCombo ? comboTrack(liveCombo, liveRows, liveSourceKey) : '';
        const liveCars = liveCombo ? comboCars(liveCombo, liveRows, liveSourceKey) : [];
        const liveTrackRaw = liveCombo ? first(liveCombo, [
          'track.rawCode',
          'track.code',
          'track.familyKey',
          'track.rawName',
          'track.trackCode',
          'trackRaw',
          'trackCode'
        ], liveTrack) : liveTrack;
        const liveTrackImage = liveCombo ? first(liveCombo, ['trackImage', 'track.image'], null) : null;
        const liveTrackAssets = liveCombo ? first(liveCombo, ['trackAssets', 'track.assets'], null) : null;
        const liveTrackPhotoCandidates = liveCombo ? first(liveCombo, ['trackPhotoCandidates', 'track.photoCandidates'], []) : [];
        const liveEvent = liveTrack ? {
          __gcLiveCombo: true,
          trackName: liveTrack,
          track: liveTrack,
          trackRaw: liveTrackRaw,
          trackCode: liveTrackRaw,
          trackData: liveCombo ? first(liveCombo, ['track'], null) : null,
          trackImage: liveTrackImage,
          trackAssets: liveTrackAssets,
          trackPhotoCandidates: Array.isArray(liveTrackPhotoCandidates) ? liveTrackPhotoCandidates : [],
          carSummary: liveCars.join(' / ')
        } : null;`;

    next = replaceRequired(next, oldLiveEvent, newLiveEvent, 'el liveEvent del campeonato');

    const oldImageFunction = `      const setChampionshipTrackImage = async (block: any, title: unknown, event: any, _source: string) => {
        const img = q('[data-home2-champ-track-image]', block) as HTMLImageElement | null;
        if (!img) return;
        const values = [
          title,
          first(event, ['trackName', 'trackRaw', 'trackCode', 'track', 'name', 'Name', 'title'], ''),
          first(event, ['Track', 'TrackName', 'TrackCode'], '')
        ].filter(Boolean);
        for (const value of values) {
          if ((window as any).GCHomeTrackResolver?.setTrackImage) {
            try {
              const ok = await (window as any).GCHomeTrackResolver.setTrackImage(img, value, 'photo');
              if (ok) {
                img.dataset.gcHomeChampImageRuntime = 'v33-resolver';
                return;
              }
            } catch (_) {}
          }
        }
        const candidates: string[] = [];
        values.forEach((value) => {
          candidates.push(...trackImageCandidatesFromCombo({ track: { name: value, code: value, displayName: value } }));
        });
        setImageWithFallbacks(img, candidates, FALLBACK_TRACK);
        img.dataset.gcHomeChampImageRuntime = 'v33-candidates';
      };`;

    const newImageFunction = `      /* ${marker} */
      const exactTrackAssetSlug = (value: unknown): string => String(value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .replace(/\\.(kn5|ini|json|txt|png|jpe?g|webp|avif|svg)$/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

      const championshipExactTrackCandidates = (title: unknown, event: any) => {
        const technicalValues = [
          first(event, ['trackRaw', 'trackCode', 'TrackCode', 'Track', 'trackData.rawCode', 'trackData.code', 'trackData.familyKey', 'trackData.rawName'], ''),
          first(event, ['trackName', 'TrackName'], '')
        ].filter(Boolean);

        const seeds = technicalValues.length ? technicalValues : [title].filter(Boolean);
        const aliases = [...new Set(seeds.map(exactTrackAssetSlug).filter(Boolean))];
        const extensions = ['webp', 'jpg', 'png', 'jpeg', 'avif'];
        const generated: string[] = [];

        aliases.forEach((alias) => {
          extensions.forEach((ext) => {
            generated.push(\`/images/tracks/\${encodeURIComponent(alias)}.\${ext}\`);
            generated.push(\`/imagenes/tracks/\${encodeURIComponent(alias)}.\${ext}\`);
          });
        });

        const image = event?.trackImage || event?.trackData?.image || {};
        const explicit = [
          image?.primary,
          ...(Array.isArray(image?.candidates) ? image.candidates : []),
          event?.trackAssets?.photo,
          ...(Array.isArray(event?.trackPhotoCandidates) ? event.trackPhotoCandidates : [])
        ].filter(Boolean).map(String);

        const exactExplicit = explicit.filter((url) => {
          let decoded = String(url || '');
          try { decoded = decodeURIComponent(decoded); } catch (_) {}
          const cleanUrl = decoded.split('?')[0].split('#')[0];
          const basename = cleanUrl.split('/').pop() || cleanUrl;
          const candidateSlug = exactTrackAssetSlug(basename);
          return aliases.some((alias) =>
            candidateSlug === alias ||
            candidateSlug.startsWith(\`\${alias}_\`) ||
            candidateSlug.endsWith(\`_\${alias}\`)
          );
        });

        return {
          aliases,
          technicalValues: technicalValues.map(String),
          candidates: [...new Set([...generated, ...exactExplicit].filter(Boolean))]
        };
      };

      const setChampionshipTrackImage = async (block: any, title: unknown, event: any, source: string) => {
        const img = q('[data-home2-champ-track-image]', block) as HTMLImageElement | null;
        if (!img) return;

        // GT4 usa primero el código técnico procedente del combo/ACSM. No se permite
        // buscar solo por "Valencia", "GP", etc., porque puede elegir otro trazado.
        if (source === 'gt4') {
          const exact = championshipExactTrackCandidates(title, event);
          if (exact.aliases.length) {
            setImageWithFallbacks(img, exact.candidates, FALLBACK_TRACK);
            img.dataset.gcHomeChampImageRuntime = 'v34-gt4-acsm-exact';
            img.dataset.gcHomeChampTrackRaw = exact.technicalValues[0] || String(title || '');
            img.dataset.gcHomeChampTrackAliases = exact.aliases.join(',');
            return;
          }
        }

        // Liga semanal conserva el resolver ya existente.
        const values = [
          title,
          first(event, ['trackName', 'trackRaw', 'trackCode', 'track', 'name', 'Name', 'title'], ''),
          first(event, ['Track', 'TrackName', 'TrackCode'], '')
        ].filter(Boolean);
        for (const value of values) {
          if ((window as any).GCHomeTrackResolver?.setTrackImage) {
            try {
              const ok = await (window as any).GCHomeTrackResolver.setTrackImage(img, value, 'photo');
              if (ok) {
                img.dataset.gcHomeChampImageRuntime = 'v34-resolver';
                return;
              }
            } catch (_) {}
          }
        }
        const candidates: string[] = [];
        values.forEach((value) => {
          candidates.push(...trackImageCandidatesFromCombo({ track: { name: value, code: value, displayName: value } }));
        });
        setImageWithFallbacks(img, candidates, FALLBACK_TRACK);
        img.dataset.gcHomeChampImageRuntime = 'v34-candidates';
      };`;

    next = replaceRequired(next, oldImageFunction, newImageFunction, 'la resolución de imagen del campeonato');

    writePreservingEol(files.home, original, next);
  } else {
    console.log('[GC Home GT4 image] Portada ya corregida.');
  }
}

// Inspector ACSM: respetar ?source=gt4.
{
  const original = fs.readFileSync(target(files.acsm), 'utf8');
  let next = original.replace(/\r\n/g, '\n');

  if (!next.includes(marker)) {
    if (!next.includes("app.get('/api/admin/acsm/championship/inspect'")
      || !next.includes('const config = getAcsmChampionshipConfig();')) {
      throw new Error('src/server/acsm-championship-routes.ts no coincide con la versión esperada.');
    }

    const inspectAnchor = `  app.get('/api/admin/acsm/championship/inspect', async (req, res) => {
    if (!(await requireAcsmAdmin(req, res, requireAdmin))) return;

    const config = getAcsmChampionshipConfig();`;

    const inspectReplacement = `  app.get('/api/admin/acsm/championship/inspect', async (req, res) => {
    if (!(await requireAcsmAdmin(req, res, requireAdmin))) return;

    // ${marker}
    const config = getAcsmChampionshipConfig(req.query.source || req.query.championship || req.query.server);`;

    next = replaceRequired(next, inspectAnchor, inspectReplacement, 'el inspector ACSM');

    writePreservingEol(files.acsm, original, next);
  } else {
    console.log('[GC Home GT4 image] Inspector ACSM ya corregido.');
  }
}

console.log('');
console.log('[GC Home GT4 image] Imagen del campeonato GT4 ligada al código técnico ACSM.');
console.log(`[GC Home GT4 image] Backup: ${backupDir}`);
console.log(`[GC Home GT4 image] Modificados: ${changed.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('');
console.log('GT4 ya no usa coincidencias difusas por el nombre visible del circuito.');
console.log('Si no existe una foto exacta para el código técnico, se muestra el fallback en vez de otra pista.');
console.log('Siguiente: npm run deps:baseline && npm run quality');
