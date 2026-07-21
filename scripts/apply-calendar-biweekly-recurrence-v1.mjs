import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'GC_CALENDAR_BIWEEKLY_RECURRENCE_V1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `calendar-biweekly-recurrence-${stamp}`);

const files = {
  server: 'src/server/index.ts',
  admin: 'src/pages/admin/calendario.astro',
  calendar: 'src/pages/calendario.astro',
  community: 'src/pages/comunidad.astro'
};

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`No se encontró el bloque esperado: ${label}`);
  if (text.indexOf(before, first + before.length) >= 0) {
    throw new Error(`El bloque aparece más de una vez: ${label}`);
  }
  return text.slice(0, first) + after + text.slice(first + before.length);
}

function transformServer(text) {
  let next = replaceOnce(
    text,
    "  repeatFrequency: 'none' | 'weekly';",
    "  repeatFrequency: 'none' | 'weekly' | 'biweekly';",
    'tipo de frecuencia del servidor'
  );
  next = replaceOnce(
    next,
    "  const repeatEnabled = gcCalendarToBoolDbV8(input?.repeatEnabled ?? input?.repeat_enabled, false) || String(input?.repeatFrequency ?? input?.repeat_frequency ?? '').toLowerCase() === 'weekly';",
    `  const requestedRepeatFrequency = String(input?.repeatFrequency ?? input?.repeat_frequency ?? '').trim().toLowerCase();
  const existingRepeatFrequency = String(existing?.repeatFrequency || '').trim().toLowerCase();
  const legacyRepeatEnabled = gcCalendarToBoolDbV8(
    input?.repeatEnabled ?? input?.repeat_enabled ?? existing?.repeatEnabled,
    false
  );
  const repeatFrequency: GcCalendarEventDbV8['repeatFrequency'] =
    requestedRepeatFrequency === 'weekly' || requestedRepeatFrequency === 'biweekly'
      ? requestedRepeatFrequency
      : requestedRepeatFrequency === 'none'
        ? 'none'
        : existingRepeatFrequency === 'weekly' || existingRepeatFrequency === 'biweekly'
          ? existingRepeatFrequency
          : legacyRepeatEnabled
            ? 'weekly'
            : 'none';
  const repeatEnabled = repeatFrequency !== 'none';`,
    'normalización de frecuencia del servidor'
  );
  next = replaceOnce(
    next,
    "    repeatFrequency: repeatEnabled ? 'weekly' : 'none',",
    '    repeatFrequency,',
    'persistencia de frecuencia del servidor'
  );
  return replaceOnce(next, '// GC CALENDAR DB STORAGE START', `// ${marker}\n// GC CALENDAR DB STORAGE START`, 'marcador del servidor');
}

function transformAdmin(text) {
  let next = replaceOnce(
    text,
    'Gestiona combos de varios días, carreras puntuales y repeticiones semanales sin duplicar eventos a mano.',
    'Gestiona combos de varios días, carreras puntuales y repeticiones semanales o quincenales sin duplicar eventos a mano.',
    'subtítulo del administrador'
  );
  next = replaceOnce(next, '<span class="gc-chip">Repetición semanal</span>', '<span class="gc-chip">Repeticiones</span>', 'chip de repetición');
  next = replaceOnce(
    next,
    '<option value="none">No repetir</option><option value="weekly">Repetir semanalmente</option>',
    '<option value="none">No repetir</option><option value="weekly">Repetir semanalmente</option><option value="biweekly">Repetir quincenalmente</option>',
    'opción quincenal'
  );
  next = replaceOnce(
    next,
    `        const isWeekly = Boolean(event.repeatEnabled || event.repeatFrequency === 'weekly');
        if (!isWeekly) return '';
        return event.repeatUntil ? \`Repetición semanal hasta \${event.repeatUntil}\` : 'Repetición semanal';`,
    `        const frequency = event.repeatFrequency === 'biweekly' ? 'biweekly' : (event.repeatFrequency === 'weekly' || event.repeatEnabled ? 'weekly' : 'none');
        if (frequency === 'none') return '';
        const label = frequency === 'biweekly' ? 'Repetición quincenal' : 'Repetición semanal';
        return event.repeatUntil ? \`\${label} hasta \${event.repeatUntil}\` : label;`,
    'etiqueta administrativa de repetición'
  );
  next = replaceOnce(
    next,
    "        const rep = repeat === 'weekly' ? ' Además, ese rango se repetirá cada semana hasta la fecha indicada.' : '';",
    `        const rep = repeat === 'weekly'
          ? ' Además, ese rango se repetirá cada semana hasta la fecha indicada.'
          : repeat === 'biweekly'
            ? ' Además, ese rango se repetirá cada dos semanas hasta la fecha indicada.'
            : '';`,
    'ayuda de repetición'
  );
  next = replaceOnce(next, "          repeatEnabled: repeatFrequency === 'weekly',", "          repeatEnabled: repeatFrequency !== 'none',", 'estado de repetición');
  next = replaceOnce(next, "          repeatUntil: repeatFrequency === 'weekly' ? (data.repeatUntil || '') : '',", "          repeatUntil: repeatFrequency !== 'none' ? (data.repeatUntil || '') : '',", 'fecha límite de repetición');
  next = replaceOnce(
    next,
    "        form.elements.repeatFrequency.value = (event.repeatEnabled || event.repeatFrequency === 'weekly') ? 'weekly' : 'none';",
    "        form.elements.repeatFrequency.value = event.repeatFrequency === 'biweekly' ? 'biweekly' : (event.repeatFrequency === 'weekly' || event.repeatEnabled ? 'weekly' : 'none');",
    'edición de frecuencia'
  );
  next = replaceOnce(
    next,
    "          const haystack = [event.title, event.type, event.trackName, event.carNames, event.description, event.startDate, event.endDate, event.repeatEnabled ? 'repetición semanal repetir' : ''].join(' ').toLowerCase();",
    "          const haystack = [event.title, event.type, event.trackName, event.carNames, event.description, event.startDate, event.endDate, repeatText(event)].join(' ').toLowerCase();",
    'búsqueda de repeticiones'
  );
  next = replaceOnce(
    next,
    "        if (payload.repeatEnabled && !payload.repeatUntil) { setMessage('Para repetir semanalmente, indica una fecha “Repetir hasta”.'); return; }",
    "        if (payload.repeatEnabled && !payload.repeatUntil) { setMessage('Para repetir el evento, indica una fecha “Repetir hasta”.'); return; }",
    'validación de fecha límite'
  );
  return replaceOnce(next, '<AppLayout title="Admin calendario | GrassCutters">', `<AppLayout title="Admin calendario | GrassCutters">\n  <!-- ${marker} -->`, 'marcador del administrador');
}

function transformCalendar(text) {
  let next = replaceOnce(
    text,
    "      const isWeeklyRepeat = (event) => Boolean(event.repeatEnabled || event.repeatFrequency === 'weekly');",
    `      const repeatFrequencyOf = (event) => event.repeatFrequency === 'biweekly' ? 'biweekly' : (event.repeatFrequency === 'weekly' || event.repeatEnabled ? 'weekly' : 'none');
      const repeatIntervalDays = (event) => repeatFrequencyOf(event) === 'biweekly' ? 14 : repeatFrequencyOf(event) === 'weekly' ? 7 : 0;
      const repeatLabelOf = (event) => repeatFrequencyOf(event) === 'biweekly' ? 'Quincenal' : repeatFrequencyOf(event) === 'weekly' ? 'Semanal' : '';`,
    'resolución pública de frecuencia'
  );
  next = replaceOnce(next, "        if (!isWeeklyRepeat(event)) return [{ start, end }];", "        const intervalDays = repeatIntervalDays(event);\n        if (!intervalDays) return [{ start, end }];", 'intervalo de recurrencia');
  next = replaceOnce(next, '        while (addDays(current, durationDays) < rangeStart) current = addDays(current, 7);', '        while (addDays(current, durationDays) < rangeStart) current = addDays(current, intervalDays);', 'avance inicial del calendario');
  next = replaceOnce(next, '          current = addDays(current, 7);', '          current = addDays(current, intervalDays);', 'avance de ocurrencias del calendario');
  next = replaceOnce(next, "            const repeatLabel = isWeeklyRepeat(event) ? 'Semanal' : '';", '            const repeatLabel = repeatLabelOf(event);', 'etiqueta pública de frecuencia');
  next = replaceOnce(
    next,
    "          const repeatTag = event.repeatLabel ? '<span class=\"gc-calendar-upcoming-repeat\">Repetición semanal</span>' : '';",
    "          const repeatTag = event.repeatLabel ? `<span class=\"gc-calendar-upcoming-repeat\">Repetición ${escapeHtml(String(event.repeatLabel).toLowerCase())}</span>` : '';",
    'etiqueta de próximos eventos'
  );
  return replaceOnce(next, '<MarketingLayout\n  title="Calendario | GrassCutters Racing"', `<MarketingLayout\n  title="Calendario | GrassCutters Racing"\n  data-biweekly-marker="${marker}"`, 'marcador del calendario');
}

function transformCommunity(text) {
  let next = replaceOnce(
    text,
    "      const isWeekly = (event) => Boolean(event.repeatEnabled || event.repeatFrequency === 'weekly');",
    `      const repeatFrequencyOf = (event) => event.repeatFrequency === 'biweekly' ? 'biweekly' : (event.repeatFrequency === 'weekly' || event.repeatEnabled ? 'weekly' : 'none');
      const repeatIntervalDays = (event) => repeatFrequencyOf(event) === 'biweekly' ? 14 : repeatFrequencyOf(event) === 'weekly' ? 7 : 0;
      const repeatLabelOf = (event) => repeatFrequencyOf(event) === 'biweekly' ? 'Quincenal' : repeatFrequencyOf(event) === 'weekly' ? 'Semanal' : '';`,
    'resolución de frecuencia en comunidad'
  );
  next = replaceOnce(
    next,
    `            if (isWeekly(event)) {
              while (addDays(current, durationDays) < today) current = addDays(current, 7);
            }`,
    `            const intervalDays = repeatIntervalDays(event);
            if (intervalDays) {
              while (addDays(current, durationDays) < today) current = addDays(current, intervalDays);
            }`,
    'avance inicial de comunidad'
  );
  next = replaceOnce(
    next,
    "                output.push({ ...event, occurrenceDate: keyOf(current), occurrenceEndDate: keyOf(currentEnd), isOccurrence: keyOf(current) !== keyOf(baseStart), repeatLabel: isWeekly(event) ? 'Semanal' : '' });",
    "                output.push({ ...event, occurrenceDate: keyOf(current), occurrenceEndDate: keyOf(currentEnd), isOccurrence: keyOf(current) !== keyOf(baseStart), repeatLabel: repeatLabelOf(event) });",
    'etiqueta de comunidad'
  );
  next = replaceOnce(next, '              if (!isWeekly(event)) break;\n              current = addDays(current, 7);', '              if (!intervalDays) break;\n              current = addDays(current, intervalDays);', 'avance de ocurrencias de comunidad');
  return replaceOnce(next, '<MarketingLayout\n  title="Comunidad | GrassCutters Racing"', `<MarketingLayout\n  title="Comunidad | GrassCutters Racing"\n  data-biweekly-marker="${marker}"`, 'marcador de comunidad');
}

const transforms = {
  [files.server]: transformServer,
  [files.admin]: transformAdmin,
  [files.calendar]: transformCalendar,
  [files.community]: transformCommunity
};

const currentFiles = Object.fromEntries(Object.keys(transforms).map((relativePath) => {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Falta ${relativePath}. No se ha modificado ningún archivo.`);
  return [relativePath, fs.readFileSync(absolutePath, 'utf8')];
}));

const applied = Object.entries(currentFiles).filter(([, text]) => text.includes(marker)).map(([relativePath]) => relativePath);
if (applied.length === Object.keys(currentFiles).length) {
  console.log(`[GC Calendar] Sin cambios: ${marker} ya estaba aplicado.`);
  process.exit(0);
}
if (applied.length > 0) {
  throw new Error(`Instalación parcial detectada (${applied.join(', ')}). Restaura el backup antes de repetir.`);
}

const nextFiles = Object.fromEntries(Object.entries(currentFiles).map(([relativePath, text]) => [relativePath, transforms[relativePath](text)]));
for (const [relativePath, next] of Object.entries(nextFiles)) {
  if (!next.includes(marker) || !next.includes('biweekly')) throw new Error(`Validación fallida para ${relativePath}. No se ha modificado ningún archivo.`);
}

for (const relativePath of Object.keys(currentFiles)) {
  const source = path.join(root, relativePath);
  const backup = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(source, backup);
}

try {
  for (const [relativePath, next] of Object.entries(nextFiles)) {
    fs.writeFileSync(path.join(root, relativePath), next, 'utf8');
  }
} catch (error) {
  for (const relativePath of Object.keys(currentFiles)) {
    fs.copyFileSync(path.join(backupDir, relativePath), path.join(root, relativePath));
  }
  throw error;
}

console.log('');
console.log('[GC Calendar] Repetición quincenal instalada.');
console.log(`[GC Calendar] Backup: ${path.relative(root, backupDir)}`);
for (const relativePath of Object.keys(currentFiles)) console.log(`[GC Calendar] Modificado: ${relativePath}`);
console.log('Intervalos disponibles: no repetir, semanal (7 días), quincenal (14 días).');
console.log('No requiere migración de base de datos.');
console.log('Siguiente: npm run quality && npm run build');
