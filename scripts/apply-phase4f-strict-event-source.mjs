import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'GC_PHASE4F_STRICT_EVENT_SOURCE_V1';
const phase4dMarker = 'GC_PHASE4D_SOURCE_ISOLATION_V1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase4f-strict-event-source-${stamp}`);
const changed = [];

function target(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  const filePath = target(relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${relativePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function backup(relativePath) {
  const source = target(relativePath);
  const destination = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function save(relativePath, original, next) {
  if (next === original) return;
  backup(relativePath);
  fs.writeFileSync(target(relativePath), next, 'utf8');
  changed.push(relativePath);
}

function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`No se encontró ${label}`);
  return text.replace(from, to);
}

function insertAfterRequired(text, anchor, block, label) {
  if (text.includes(block)) return text;
  const index = text.indexOf(anchor);
  if (index < 0) throw new Error(`No se encontró ${label}`);
  const end = index + anchor.length;
  return `${text.slice(0, end)}${block}${text.slice(end)}`;
}

const markerFiles = [
  'src/server/gc-ratings/ratingService.ts',
  'src/server/gc-ratings/routes.ts',
  'src/server/acsm-championship-routes.ts',
  'src/pages/campeonato/ronda/[eventId].astro'
];

const alreadyApplied = markerFiles.every((relativePath) =>
  fs.existsSync(target(relativePath)) &&
  fs.readFileSync(target(relativePath), 'utf8').includes(marker)
);

if (alreadyApplied) {
  console.log(`[GC Phase 4F] Sin cambios: ${marker} ya estaba aplicado.`);
  process.exit(0);
}

// 1. Servicio: una fuente explícita nunca puede saltar a la otra competición.
{
  const relativePath = 'src/server/gc-ratings/ratingService.ts';
  const original = read(relativePath);

  if (!original.includes(phase4dMarker)) {
    throw new Error('Phase 4D no está aplicada. Se requiere el aislamiento persistente Liga / GT4.');
  }

  if (original.includes(marker)) {
    console.log(`[GC Phase 4F] ${relativePath} ya estaba aplicado.`);
  } else {
    let next = original;

    const normalizeAnchor = `function normalizeChampionshipSource(value: unknown) {
  const source = String(value || '').trim().toLowerCase();
  return source === 'gt4' ? 'gt4' : 'weekly';
}`;

    const strictHelper = `

/* ${marker} */
type StrictChampionshipSourceV1 = 'weekly' | 'gt4';

function explicitChampionshipSourceV1(value: unknown): StrictChampionshipSourceV1 | null {
  const source = String(value || '').trim().toLowerCase();
  if (!source) return null;
  if (['weekly', 'main', 'liga', 'league', 'grasscutters'].includes(source)) return 'weekly';
  if (['gt4', 'gt-4', 'gt', 'supra', 'supra-gt4'].includes(source)) return 'gt4';
  return null;
}`;

    next = insertAfterRequired(
      next,
      normalizeAnchor,
      strictHelper,
      'normalizeChampionshipSource'
    );

    const oldGetEvent = `  async getEvent(eventId: string, options: PlainObject = {}) {
    let normalizedEventId = String(eventId || '');
    try {
      normalizedEventId = decodeURIComponent(normalizedEventId);
    } catch {}

    const requestedSourceRaw = String(options.source || options.server || options.championship || '').trim();
    const requestedSource = requestedSourceRaw ? normalizeChampionshipSource(requestedSourceRaw) : 'weekly';
    const autoFallback = options.autoSourceFallback !== false;
    const sourceCandidates = [...new Set([
      requestedSource,
      ...(autoFallback ? ['weekly', 'gt4'] : [])
    ])];

    for (const sourceCandidate of sourceCandidates) {
      const payload = await this.getChampionshipPayload(false, sourceCandidate);
      const allEvents = [
        ...ratingArray(payload.championship.events),
        ...ratingArray(payload.championship.strackerSeries?.processedEvents),
        ...ratingArray(payload.championship.strackerSeries?.reviewedEvents)
      ];
      const event = allEvents.find((item: PlainObject) => String(item.id) === normalizedEventId);
      if (!event) continue;
      return {
        ok: true,
        source: \`gc-ratings-v1:\${sourceCandidate}\`,
        eventSource: sourceCandidate,
        generatedAt: payload.generatedAt,
        event,
        diagnostics: payload.diagnostics
      };
    }

    return null;
  }`;

    const newGetEvent = `  async getEvent(eventId: string, options: PlainObject = {}) {
    let normalizedEventId = String(eventId || '');
    try {
      normalizedEventId = decodeURIComponent(normalizedEventId);
    } catch {}

    const requestedSourceRaw = String(
      options.source || options.server || options.championship || ''
    ).trim();
    const explicitSource = requestedSourceRaw
      ? explicitChampionshipSourceV1(requestedSourceRaw)
      : null;

    if (requestedSourceRaw && !explicitSource) {
      return {
        ok: false,
        code: 'INVALID_EVENT_SOURCE',
        source: 'gc-ratings-v1:strict-source',
        requestedSource: requestedSourceRaw,
        allowedSources: ['weekly', 'gt4'],
        message: \`Fuente no válida: \${requestedSourceRaw}. Usa weekly o gt4.\`
      };
    }

    // Fuente explícita: solo se consulta esa competición.
    // URL antigua sin source: se consultan ambas y solo se acepta una coincidencia única.
    const sourceCandidates: StrictChampionshipSourceV1[] = explicitSource
      ? [explicitSource]
      : ['weekly', 'gt4'];

    const matches: Array<{
      sourceCandidate: StrictChampionshipSourceV1;
      payload: PlainObject;
      event: PlainObject;
    }> = [];

    for (const sourceCandidate of sourceCandidates) {
      const payload = await this.getChampionshipPayload(false, sourceCandidate);
      const allEvents = [
        ...ratingArray(payload.championship.events),
        ...ratingArray(payload.championship.strackerSeries?.processedEvents),
        ...ratingArray(payload.championship.strackerSeries?.reviewedEvents)
      ];
      const event = allEvents.find((item: PlainObject) => String(item.id) === normalizedEventId);
      if (event) matches.push({ sourceCandidate, payload, event });
    }

    if (!matches.length) return null;

    if (!explicitSource && matches.length > 1) {
      return {
        ok: false,
        code: 'AMBIGUOUS_EVENT_SOURCE',
        source: 'gc-ratings-v1:strict-source',
        eventId: normalizedEventId,
        matchingSources: matches.map((match) => match.sourceCandidate),
        message: 'El UUID existe en más de una competición. Añade ?source=weekly o ?source=gt4.'
      };
    }

    const match = matches[0];
    return {
      ok: true,
      source: \`gc-ratings-v1:\${match.sourceCandidate}\`,
      eventSource: match.sourceCandidate,
      sourceResolution: explicitSource ? 'explicit' : 'auto-unique',
      requestedSource: explicitSource || null,
      generatedAt: match.payload.generatedAt,
      event: {
        ...match.event,
        sourceKey: match.event.sourceKey || match.sourceCandidate,
        championshipSource: match.event.championshipSource || match.sourceCandidate
      },
      diagnostics: match.payload.diagnostics
    };
  }`;

    next = replaceRequired(next, oldGetEvent, newGetEvent, 'getEvent');
    save(relativePath, original, next);
  }
}

// 2. API: validar source, devolver 409 en colisión y 404 específico por competición.
{
  const relativePath = 'src/server/gc-ratings/routes.ts';
  const original = read(relativePath);

  if (original.includes(marker)) {
    console.log(`[GC Phase 4F] ${relativePath} ya estaba aplicado.`);
  } else {
    const oldRoute = `  app.get('/api/gc/ratings/event/:eventId', async (req, res) => {
    try {
      let eventId = String(req.params.eventId || '');
      try {
        eventId = decodeURIComponent(eventId);
      } catch {}
      const fallbackEnabled = String(req.query.fallback || '').trim() === '1';
      const source = req.query.source || req.query.server || req.query.championship || '';
      const processRequested = parseBooleanish(req.query.process || req.query.recalculate, false) === true;
      let autoProcess: any = null;

      if (processRequested) {
        const adminAllowed = await requireAdmin(req);
        if (!adminAllowed) {
          autoProcess = {
            ok: false,
            skipped: true,
            message: 'Recalculo SR/GSR no ejecutado: necesitas sesión admin.'
          };
        } else {
          const rawSource = String(Array.isArray(source) ? source[0] : source || '').trim().toLowerCase();
          const processed = [];
          if (!rawSource || ['all', 'global', 'both', 'todas'].includes(rawSource)) {
            try {
              processed.push(await service.processNewEventsAllSourcesV1({ trustedAutomation: true }));
            } catch (error) {
              processed.push({ ok: false, source: 'all', message: error instanceof Error ? error.message : String(error) });
            }
          } else {
            try {
              processed.push(await service.processNewEvents({ source: rawSource }));
            } catch (error) {
              processed.push({ ok: false, source: rawSource, message: error instanceof Error ? error.message : String(error) });
            }
          }
          autoProcess = { ok: true, processed };
        }
      }

      const payload = await service.getEvent(eventId, {
        fallback: fallbackEnabled,
        source,
        autoSourceFallback: true
      });
      if (!payload) return res.status(404).json({ ok: false, source: 'gc-ratings-v1:v16-round-rating-refresh', eventSource: 'none', message: 'Evento no encontrado en weekly ni GT4.' });
      res.status(payload.ok === false ? 404 : 200).json({
        ...payload,
        processRequested,
        autoProcess
      });
    } catch (error) {
      res.status(200).json(formatStrackerMirrorError(error));
    }
  });`;

    const newRoute = `  // ${marker}
  app.get('/api/gc/ratings/event/:eventId', async (req, res) => {
    try {
      let eventId = String(req.params.eventId || '');
      try {
        eventId = decodeURIComponent(eventId);
      } catch {}

      const sourceValue = req.query.source || req.query.server || req.query.championship || '';
      const sourceRaw = String(Array.isArray(sourceValue) ? sourceValue[0] : sourceValue || '').trim().toLowerCase();
      const weeklyAliases = ['weekly', 'main', 'liga', 'league', 'grasscutters'];
      const gt4Aliases = ['gt4', 'gt-4', 'gt', 'supra', 'supra-gt4'];
      const explicitSource = sourceRaw
        ? weeklyAliases.includes(sourceRaw)
          ? 'weekly'
          : gt4Aliases.includes(sourceRaw)
            ? 'gt4'
            : null
        : null;

      if (sourceRaw && !explicitSource) {
        return res.status(400).json({
          ok: false,
          code: 'INVALID_EVENT_SOURCE',
          source: 'gc-ratings-v1:strict-source',
          requestedSource: sourceRaw,
          allowedSources: ['weekly', 'gt4'],
          message: \`Fuente no válida: \${sourceRaw}. Usa weekly o gt4.\`
        });
      }

      const processRequested = parseBooleanish(req.query.process || req.query.recalculate, false) === true;
      let autoProcess: any = null;

      if (processRequested) {
        const adminAllowed = await requireAdmin(req);
        if (!adminAllowed) {
          autoProcess = {
            ok: false,
            skipped: true,
            message: 'Recalculo SR/GSR no ejecutado: necesitas sesión admin.'
          };
        } else {
          const processed = [];
          if (!explicitSource) {
            try {
              processed.push(await service.processNewEventsAllSourcesV1({ trustedAutomation: true }));
            } catch (error) {
              processed.push({ ok: false, source: 'all', message: error instanceof Error ? error.message : String(error) });
            }
          } else {
            try {
              processed.push(await service.processNewEvents({ source: explicitSource }));
            } catch (error) {
              processed.push({ ok: false, source: explicitSource, message: error instanceof Error ? error.message : String(error) });
            }
          }
          autoProcess = { ok: true, processed };
        }
      }

      const payload = await service.getEvent(eventId, {
        source: explicitSource || '',
        autoSourceFallback: !explicitSource
      });

      if (!payload) {
        const message = explicitSource
          ? \`Evento no encontrado en la fuente \${explicitSource}.\`
          : 'Evento no encontrado en weekly ni GT4.';
        return res.status(404).json({
          ok: false,
          code: 'EVENT_NOT_FOUND',
          source: 'gc-ratings-v1:strict-source',
          eventId,
          eventSource: explicitSource || 'none',
          message
        });
      }

      if (payload.ok === false) {
        const status = payload.code === 'AMBIGUOUS_EVENT_SOURCE' ? 409 : 400;
        return res.status(status).json({
          ...payload,
          processRequested,
          autoProcess
        });
      }

      res.status(200).json({
        ...payload,
        processRequested,
        autoProcess
      });
    } catch (error) {
      res.status(200).json(formatStrackerMirrorError(error));
    }
  });`;

    const next = replaceRequired(original, oldRoute, newRoute, 'la ruta de evento');
    save(relativePath, original, next);
  }
}

// 3. ACSM: todos los eventos llevan source explícito y enlace no ambiguo.
{
  const relativePath = 'src/server/acsm-championship-routes.ts';
  const original = read(relativePath);

  if (original.includes(marker)) {
    console.log(`[GC Phase 4F] ${relativePath} ya estaba aplicado.`);
  } else {
    let next = original;

    next = replaceRequired(
      next,
      `    href: source === 'gt4'
      ? \`/campeonato/ronda/\${encodeURIComponent(id)}?source=gt4\`
      : \`/campeonato/ronda/\${encodeURIComponent(id)}\`,
    name: cleanDisplayText`,
      `    // ${marker}
    sourceKey: source,
    championshipSource: source,
    href: \`/campeonato/ronda/\${encodeURIComponent(id)}?source=\${encodeURIComponent(source)}\`,
    name: cleanDisplayText`,
      'el href source-aware de las rondas'
    );

    save(relativePath, original, next);
  }
}

// 4. Página de campeonato semanal: el fallback también conserva source=weekly.
{
  const relativePath = 'src/pages/campeonato.astro';
  const original = read(relativePath);

  if (original.includes(marker)) {
    console.log(`[GC Phase 4F] ${relativePath} ya estaba aplicado.`);
  } else {
    const next = replaceRequired(
      original,
      `        els.lastLink.href = event.href || \`/campeonato/ronda/\${encodeURIComponent(event.id)}\`;`,
      `        // ${marker}
        els.lastLink.href = event.href || \`/campeonato/ronda/\${encodeURIComponent(event.id)}?source=weekly\`;`,
      'el fallback del enlace de última carrera'
    );

    save(relativePath, original, next);
  }
}

// 5. Detalle de ronda: source inválido se bloquea y las URLs antiguas se canonizan.
{
  const relativePath = 'src/pages/campeonato/ronda/[eventId].astro';
  const original = read(relativePath);

  if (original.includes(marker)) {
    console.log(`[GC Phase 4F] ${relativePath} ya estaba aplicado.`);
  } else {
    let next = original;

    next = replaceRequired(
      next,
      `      // GC_ROUND_SOURCE_FALLBACK_V14`,
      `      // GC_ROUND_SOURCE_FALLBACK_V14
      // ${marker}`,
      'el marcador de fuente de ronda'
    );

    const oldSourceFunction = `      function getRoundSourceV14() {
        const params = new URLSearchParams(window.location.search || '');
        const raw = String(params.get('source') || params.get('server') || params.get('championship') || '').trim().toLowerCase();
        return ['gt4', 'gt-4', 'gt', 'supra', 'supra-gt4'].includes(raw) ? 'gt4' : (raw ? 'weekly' : '');
      }`;

    const newSourceFunction = `      function getRoundSourceV14() {
        const params = new URLSearchParams(window.location.search || '');
        const raw = String(params.get('source') || params.get('server') || params.get('championship') || '').trim().toLowerCase();
        if (!raw) return { source: '', explicit: false, invalid: false, raw: '' };
        if (['weekly', 'main', 'liga', 'league', 'grasscutters'].includes(raw)) {
          return { source: 'weekly', explicit: true, invalid: false, raw };
        }
        if (['gt4', 'gt-4', 'gt', 'supra', 'supra-gt4'].includes(raw)) {
          return { source: 'gt4', explicit: true, invalid: false, raw };
        }
        return { source: '', explicit: true, invalid: true, raw };
      }

      function canonicalizeRoundSourceV1(source) {
        if (!source) return;
        const url = new URL(window.location.href);
        url.searchParams.delete('server');
        url.searchParams.delete('championship');
        url.searchParams.set('source', source);
        window.history.replaceState(null, '', \`\${url.pathname}?\${url.searchParams.toString()}\${url.hash}\`);
        document.documentElement.dataset.gcRoundEventSource = source;
      }`;

    next = replaceRequired(next, oldSourceFunction, newSourceFunction, 'getRoundSourceV14');

    const oldLoad = `      async function load() {
        try {
          const params = new URLSearchParams();
          params.set('refresh', '1');
          params.set('fallback', '1');
          const roundSource = getRoundSourceV14();
          if (roundSource) params.set('source', roundSource);
          const response = await fetch(\`/api/gc/ratings/event/\${encodeURIComponent(eventId)}?\${params.toString()}\`, { cache: 'no-store' });
          const data = await response.json();
          await render(data);
        } catch (error) {
          renderError(error?.message || String(error));
        }
      }`;

    const newLoad = `      async function load() {
        try {
          const sourceRequest = getRoundSourceV14();
          if (sourceRequest.invalid) {
            renderError(\`Fuente no válida: \${sourceRequest.raw}. Usa weekly o gt4.\`);
            return;
          }

          const params = new URLSearchParams();
          params.set('refresh', '1');
          if (sourceRequest.source) params.set('source', sourceRequest.source);

          const response = await fetch(
            \`/api/gc/ratings/event/\${encodeURIComponent(eventId)}?\${params.toString()}\`,
            { cache: 'no-store' }
          );
          const data = await response.json();

          if (!response.ok || data?.ok === false) {
            renderError(data?.message || \`HTTP \${response.status}\`);
            return;
          }

          if (
            sourceRequest.explicit &&
            sourceRequest.source &&
            data.eventSource !== sourceRequest.source
          ) {
            renderError(
              \`La ronda pertenece a \${data.eventSource || 'otra fuente'}, no a \${sourceRequest.source}.\`
            );
            return;
          }

          canonicalizeRoundSourceV1(data.eventSource || sourceRequest.source);
          await render(data);
        } catch (error) {
          renderError(error?.message || String(error));
        }
      }`;

    next = replaceRequired(next, oldLoad, newLoad, 'la carga estricta de ronda');
    save(relativePath, original, next);
  }
}

console.log('');
console.log('[GC Phase 4F] Fuente estricta de rondas instalada.');
console.log(`[GC Phase 4F] Backup: ${path.relative(root, backupDir)}`);
console.log('[GC Phase 4F] Archivos modificados:');
for (const file of changed) console.log(`  - ${file}`);
console.log('');
console.log('Este instalador no modifica MySQL, ratings, resultados ni sTracker.');
console.log('Siguiente: npm run deps:baseline && npm run quality');
