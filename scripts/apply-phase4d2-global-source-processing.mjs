import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'GC_PHASE4D2_GLOBAL_SOURCE_PROCESSING_V1';
const phase4dMarker = 'GC_PHASE4D_SOURCE_ISOLATION_V1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase4d2-global-processing-${stamp}`);
const payloadDir = path.join(root, 'scripts', 'phase4d2-global-processing-payload');
const changed = [];

function target(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  const filePath = target(relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${relativePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function readPayload(name) {
  const filePath = path.join(payloadDir, name);
  if (!fs.existsSync(filePath)) throw new Error(`Falta payload ${path.relative(root, filePath)}`);
  return fs.readFileSync(filePath, 'utf8').trimEnd();
}

function backup(relativePath) {
  const source = target(relativePath);
  if (!fs.existsSync(source)) return;
  const destination = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function save(relativePath, original, next) {
  if (original === next) return;
  backup(relativePath);
  fs.mkdirSync(path.dirname(target(relativePath)), { recursive: true });
  fs.writeFileSync(target(relativePath), next, 'utf8');
  changed.push(relativePath);
}

function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`No se encontró ${label}`);
  return text.replace(from, to);
}

function insertBeforeRequired(text, anchor, block, label) {
  if (text.includes(block)) return text;
  const index = text.indexOf(anchor);
  if (index < 0) throw new Error(`No se encontró ${label}`);
  return `${text.slice(0, index)}${block}\n\n${text.slice(index)}`;
}

const markerFiles = [
  'src/server/gc-ratings/ratingService.ts',
  'src/server/gc-ratings/routes.ts',
  'src/pages/admin/integridad-ratings/procesado-global.astro'
];
const alreadyApplied = markerFiles.every((relativePath) =>
  fs.existsSync(target(relativePath)) &&
  fs.readFileSync(target(relativePath), 'utf8').includes(marker)
);

if (alreadyApplied) {
  if (fs.existsSync(payloadDir)) fs.rmSync(payloadDir, { recursive: true, force: true });
  console.log(`[GC Phase 4D.2] Sin cambios: ${marker} ya estaba aplicado.`);
  process.exit(0);
}

const serviceHelpers = readPayload('service-helpers.txt');
const serviceMethods = readPayload('service-methods.txt');
const globalPage = readPayload('procesado-global.astro');

// 1. Servicio global: simulación, orden cronológico y una única escritura.
{
  const relativePath = 'src/server/gc-ratings/ratingService.ts';
  const original = read(relativePath);

  if (!original.includes(phase4dMarker)) {
    throw new Error('Phase 4D no está aplicada. Ejecuta primero el aislamiento de Liga y GT4.');
  }

  if (original.includes(marker)) {
    console.log(`[GC Phase 4D.2] ${relativePath} ya estaba aplicado.`);
  } else {
    let next = insertBeforeRequired(
      original,
      'function enrichChampionship(championship: PlainObject, snapshot: RatingsSnapshot) {',
      serviceHelpers,
      'el helper enrichChampionship'
    );

    next = insertBeforeRequired(
      next,
      '  async processNewEvents(options: PlainObject = {}) {',
      serviceMethods,
      'el método processNewEvents'
    );

    save(relativePath, original, next);
  }
}

// 2. Rutas admin y automatización: el valor por defecto pasa a ser global.
{
  const relativePath = 'src/server/gc-ratings/routes.ts';
  const original = read(relativePath);

  if (original.includes(marker)) {
    console.log(`[GC Phase 4D.2] ${relativePath} ya estaba aplicado.`);
  } else {
    let next = original;

    const endpoint = `
  // ${marker}
  app.post('/api/gc/ratings/process-all-sources', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const allowed = await requireAdmin(req);
      if (!allowed) return res.status(403).json({ ok: false, source: 'gc-ratings-v1', message: 'Admin requerido.' });

      const dryRunRaw = req.query.dryRun ?? req.body?.dryRun;
      const confirmationRaw = req.query.confirmation ?? req.body?.confirmation;
      const dryRun = parseBooleanish(dryRunRaw, true) !== false;
      const confirmation = String(confirmationRaw || '').trim();
      const payload = await service.processNewEventsAllSourcesV1({ dryRun, confirmation });
      res.json(payload);
    } catch (error) {
      res.status(400).json({
        ok: false,
        source: 'gc-ratings-v1:global-source-processing',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
`;

    next = insertBeforeRequired(
      next,
      "  app.post('/api/gc/ratings/process-new-events', async (req, res) => {",
      endpoint.trimEnd(),
      'la ruta process-new-events'
    );

    next = replaceRequired(
      next,
      `      const payload = await service.processNewEvents({ source: req.query.source || req.body?.source || 'weekly' });`,
      `      const requestedSource = String(req.query.source || req.body?.source || '').trim().toLowerCase();
      const processGlobally = !requestedSource || ['all', 'global', 'both', 'todas'].includes(requestedSource);
      const payload = processGlobally
        ? await service.processNewEventsAllSourcesV1({ trustedAutomation: true })
        : await service.processNewEvents({ source: requestedSource });`,
      'el procesado del cron'
    );

    next = replaceRequired(
      next,
      `          const processSources = rawSource ? [rawSource] : ['weekly', 'gt4'];
          const processed = [];
          for (const sourceItem of processSources) {
            try {
              processed.push(await service.processNewEvents({ source: sourceItem }));
            } catch (error) {
              processed.push({ ok: false, source: sourceItem, message: error instanceof Error ? error.message : String(error) });
            }
          }
          autoProcess = { ok: true, processed };`,
      `          const processed = [];
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
          autoProcess = { ok: true, processed };`,
      'el procesado de evento sin fuente explícita'
    );

    next = replaceRequired(
      next,
      `      const payload = await service.processNewEvents({ source: req.query.source || req.body?.source || 'weekly' });
      res.json({
        ok: true,
        source: 'gc-ratings-v1',
        generatedAt: payload.snapshot.generatedAt,`,
      `      const requestedSource = String(req.query.source || req.body?.source || '').trim().toLowerCase();
      const processGlobally = !requestedSource || ['all', 'global', 'both', 'todas'].includes(requestedSource);
      const payload = processGlobally
        ? await service.processNewEventsAllSourcesV1({ trustedAutomation: true })
        : await service.processNewEvents({ source: requestedSource });
      res.json({
        ok: true,
        source: processGlobally ? 'gc-ratings-v1:global' : 'gc-ratings-v1',
        generatedAt: payload.snapshot.generatedAt,`,
      'el procesado administrativo por defecto'
    );

    save(relativePath, original, next);
  }
}

// 3. Página funcional de simulación/aplicación.
{
  const relativePath = 'src/pages/admin/integridad-ratings/procesado-global.astro';
  const original = fs.existsSync(target(relativePath)) ? read(relativePath) : '';

  if (original.includes(marker)) {
    console.log(`[GC Phase 4D.2] ${relativePath} ya estaba aplicado.`);
  } else {
    backup(relativePath);
    fs.mkdirSync(path.dirname(target(relativePath)), { recursive: true });
    fs.writeFileSync(target(relativePath), globalPage, 'utf8');
    changed.push(relativePath);
  }
}

// 4. Acceso desde la página de fuentes.
{
  const relativePath = 'src/pages/admin/integridad-ratings/fuentes.astro';
  const original = read(relativePath);

  if (original.includes(marker)) {
    console.log(`[GC Phase 4D.2] ${relativePath} ya estaba aplicado.`);
  } else {
    const next = replaceRequired(
      original,
      `      <p><a class="gc-btn" href="/admin/integridad-ratings">Volver a integridad de ratings</a></p>`,
      `      <p class="gc-source-actions">
        <a class="gc-btn gc-btn--primary" href="/admin/integridad-ratings/procesado-global">Procesar Liga + GT4</a>
        <a class="gc-btn" href="/admin/integridad-ratings">Volver a integridad de ratings</a>
      </p>
      <!-- ${marker} -->`,
      'el enlace de vuelta de la página de fuentes'
    );
    save(relativePath, original, next);
  }
}

if (fs.existsSync(payloadDir)) fs.rmSync(payloadDir, { recursive: true, force: true });

console.log('');
console.log('[GC Phase 4D.2] Procesado global Liga + GT4 instalado.');
console.log(`[GC Phase 4D.2] Backup de código: ${path.relative(root, backupDir)}`);
console.log('[GC Phase 4D.2] Archivos modificados:');
for (const file of changed) console.log(`  - ${file}`);
console.log('');
console.log('Este instalador no modifica MySQL ni procesa carreras.');
console.log('Después del deploy abre /admin/integridad-ratings/procesado-global.');
console.log('Primero ejecuta la simulación y comprueba safeToApply=true.');
