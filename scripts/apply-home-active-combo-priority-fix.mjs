import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const relativePath = 'src/pages/index.astro';
const filePath = path.join(root, relativePath);

if (!fs.existsSync(filePath)) {
  throw new Error(`No existe ${relativePath}`);
}

const original = fs.readFileSync(filePath, 'utf8');
let next = original;

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `home-active-combo-priority-${timestamp}`);
const backupPath = path.join(backupDir, relativePath);

const oldHeroBlock = `        const champTrack = championshipTrackForSource(source === 'gt4' ? 'gt4' : 'weekly');
        const champCars = championshipCarsForSource(source === 'gt4' ? 'gt4' : 'weekly');
        const track = cleanPublicName(champTrack || comboTrack(combo, rows, source), source);
        const cars = champCars.length ? champCars : comboCars(combo, rows, source);`;

const newHeroBlock = `        // GC_HOME_ACTIVE_COMBO_PRIORITY_V1:
        // El héroe representa el combo que está rodando ahora. El calendario del
        // campeonato solo se usa como último fallback cuando la API del combo no
        // aporta circuito o coches.
        const comboTrackName = comboTrack(combo, rows, source);
        const comboCarNames = comboCars(combo, rows, source);
        const fallbackTrack = championshipTrackForSource(source === 'gt4' ? 'gt4' : 'weekly');
        const fallbackCars = championshipCarsForSource(source === 'gt4' ? 'gt4' : 'weekly');
        const track = cleanPublicName(comboTrackName || fallbackTrack, source);
        const cars = comboCarNames.length ? comboCarNames : fallbackCars;`;

if (next.includes(oldHeroBlock)) {
  next = next.replace(oldHeroBlock, newHeroBlock);
} else if (!next.includes('GC_HOME_ACTIVE_COMBO_PRIORITY_V1')) {
  throw new Error('No se encontró el bloque del héroe esperado. No se aplicó ningún cambio inseguro.');
}

const oldPulseTrackBlock = `        const champTrack = championshipTrackForSource(source === 'gt4' ? 'gt4' : 'weekly');
        const track = compactTrackLabel(champTrack || comboTrack(combo, rows, source));`;

const newPulseTrackBlock = `        const comboTrackName = comboTrack(combo, rows, source);
        const fallbackTrack = championshipTrackForSource(source === 'gt4' ? 'gt4' : 'weekly');
        const track = compactTrackLabel(comboTrackName || fallbackTrack);`;

if (next.includes(oldPulseTrackBlock)) {
  next = next.replace(oldPulseTrackBlock, newPulseTrackBlock);
} else if (!next.includes('const comboTrackName = comboTrack(combo, rows, source);')) {
  throw new Error('No se encontró el bloque de circuito de Combo Pulse.');
}

const oldPulseCarsBlock = `        const champCars = championshipCarsForSource(source === 'gt4' ? 'gt4' : 'weekly');
        const cars = champCars.length || Number(first(combo, ['carsCount', 'usedCarsCount', 'summary.usedCarsCount'], 0)) || (comboCars(combo, rows, source) || []).length || 0;`;

const newPulseCarsBlock = `        const comboCarNames = comboCars(combo, rows, source);
        const fallbackCars = championshipCarsForSource(source === 'gt4' ? 'gt4' : 'weekly');
        const cars = comboCarNames.length || Number(first(combo, ['carsCount', 'usedCarsCount', 'summary.usedCarsCount'], 0)) || fallbackCars.length || 0;`;

if (next.includes(oldPulseCarsBlock)) {
  next = next.replace(oldPulseCarsBlock, newPulseCarsBlock);
} else if (!next.includes('const comboCarNames = comboCars(combo, rows, source);')) {
  throw new Error('No se encontró el bloque de coches de Combo Pulse.');
}

if (!next.includes("document.documentElement.dataset.gcHomeActiveComboPriority = 'v1';")) {
  const marker = "      document.documentElement.dataset.gcHomeTopTimesRuntime = 'v37-avatar-name-cache-first';";
  if (!next.includes(marker)) {
    throw new Error('No se encontró el marcador de runtime de la home.');
  }
  next = next.replace(
    marker,
    `${marker}\n      document.documentElement.dataset.gcHomeActiveComboPriority = 'v1';`
  );
}

if (next === original) {
  console.log('[GC home active combo] Ya estaba aplicado; no se modificó el archivo.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(filePath, backupPath);
fs.writeFileSync(filePath, next, 'utf8');

console.log('');
console.log('[GC home active combo] Aplicado.');
console.log(`[GC home active combo] Backup: ${backupDir}`);
console.log(`[GC home active combo] Modificado: ${relativePath}`);
console.log('[GC home active combo] El héroe y Combo Pulse priorizan activeCombo; el campeonato queda solo como fallback.');
console.log('[GC home active combo] Siguiente: npm run quality');
