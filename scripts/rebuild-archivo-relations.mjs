#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STORE_PATH = path.join(ROOT, 'data', 'app', 'motorsport-archive.json');
const LIMIT = Number(process.env.ARCHIVO_RELATIONS_LIMIT || 12);
const DRY_RUN = ['1','true','yes','si','sí'].includes(String(process.env.ARCHIVO_RELATIONS_DRY_RUN || '').toLowerCase());

function text(value) { return String(value ?? '').trim(); }
function normalize(value) {
  return text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function getItems(store) {
  if (Array.isArray(store?.items)) return store.items;
  if (Array.isArray(store?.entries)) return store.entries;
  if (Array.isArray(store)) return store;
  return [];
}
function setItems(store, items) {
  if (Array.isArray(store?.items)) store.items = items;
  else if (Array.isArray(store?.entries)) store.entries = items;
  else if (Array.isArray(store)) return items;
  else store.items = items;
  return store;
}
function titleOf(item) { return text(item?.title || item?.nombre || item?.name || item?.slug || item?.id); }
function categoryOf(item) { return text(item?.category || item?.type || item?.kind || ''); }
function factsOf(item) { return item?.facts || item?.fields || item?.data || {}; }
function getField(item, keys) {
  const facts = factsOf(item);
  for (const key of keys) {
    const direct = text(item?.[key]);
    if (direct) return direct;
    const fact = text(facts?.[key]);
    if (fact) return fact;
  }
  return '';
}
function labelFor(item) {
  const category = categoryOf(item);
  const map = { circuits:'Circuito', circuitos:'Circuito', drivers:'Piloto', pilotos:'Piloto', vehicles:'Vehículo', vehiculos:'Vehículo', championships:'Campeonato', campeonatos:'Campeonato', records:'Récord', glosario:'Glosario', glossary:'Glosario' };
  return map[category] || category || 'Ficha';
}
function buildAutoRelationsForItem(item, allItems, limit) {
  const currentId = text(item?.id);
  const currentCategory = normalize(categoryOf(item));
  const title = normalize(titleOf(item));
  const country = normalize(getField(item, ['pais', 'country']));
  const city = normalize(getField(item, ['ciudad', 'poblacion', 'city']));
  const championship = normalize(getField(item, ['campeonato_principal', 'campeonato', 'championship']));
  const driver = normalize(getField(item, ['piloto', 'driver']));
  const vehicle = normalize(getField(item, ['vehiculo', 'vehicle', 'coche']));
  const circuit = normalize(getField(item, ['circuito', 'circuito_slug', 'circuito_nombre', 'track']));
  const candidates = [];
  for (const target of allItems) {
    const targetId = text(target?.id);
    if (!targetId || targetId === currentId) continue;
    const targetCategory = normalize(categoryOf(target));
    const targetTitle = normalize(titleOf(target));
    const targetCountry = normalize(getField(target, ['pais', 'country']));
    const targetCity = normalize(getField(target, ['ciudad', 'poblacion', 'city']));
    const targetChampionship = normalize(getField(target, ['campeonato_principal', 'campeonato', 'championship']));
    const targetDriver = normalize(getField(target, ['piloto', 'driver']));
    const targetVehicle = normalize(getField(target, ['vehiculo', 'vehicle', 'coche']));
    const targetCircuit = normalize(getField(target, ['circuito', 'circuito_slug', 'circuito_nombre', 'track']));
    let score = 0;
    const reasons = [];
    if (circuit && (targetTitle.includes(circuit) || targetCircuit === circuit)) { score += 95; reasons.push('Mismo circuito'); }
    if (targetCircuit && (title.includes(targetCircuit) || circuit === targetCircuit)) { score += 95; reasons.push('Mismo circuito'); }
    if (driver && (targetTitle.includes(driver) || targetDriver === driver)) { score += 85; reasons.push('Mismo piloto'); }
    if (targetDriver && (title.includes(targetDriver) || driver === targetDriver)) { score += 85; reasons.push('Mismo piloto'); }
    if (vehicle && (targetTitle.includes(vehicle) || targetVehicle === vehicle)) { score += 80; reasons.push('Mismo vehículo'); }
    if (targetVehicle && (title.includes(targetVehicle) || vehicle === targetVehicle)) { score += 80; reasons.push('Mismo vehículo'); }
    if (championship && targetChampionship && championship === targetChampionship) { score += 55; reasons.push('Mismo campeonato'); }
    if (country && targetCountry && country === targetCountry) { score += 30; reasons.push('Mismo país'); }
    if (city && targetCity && city === targetCity) { score += 25; reasons.push('Misma ciudad/zona'); }
    if (currentCategory && targetCategory && currentCategory === targetCategory) { score += 10; reasons.push('Misma categoría'); }
    if (score <= 0) continue;
    candidates.push({ id: `${currentId}-${targetId}`, targetId, targetSlug: text(target?.slug), targetCategory: categoryOf(target), targetTitle: titleOf(target), label: labelFor(target), reason: [...new Set(reasons)].slice(0, 2).join(' · '), score, source: 'auto' });
  }
  return candidates.sort((a,b) => b.score - a.score || a.targetTitle.localeCompare(b.targetTitle)).slice(0, limit);
}

if (!fs.existsSync(STORE_PATH)) {
  console.error(`[Archivo Motorsport] No existe ${STORE_PATH}`);
  process.exit(1);
}

const store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
const items = getItems(store);
let totalRelations = 0;
const nextItems = items.map((item) => {
  const manual = Array.isArray(item.relationsManual) ? item.relationsManual : [];
  const hidden = Array.isArray(item.relationsHidden) ? item.relationsHidden : [];
  const auto = buildAutoRelationsForItem(item, items, LIMIT).filter((rel) => !hidden.includes(rel.targetId));
  totalRelations += auto.length;
  return { ...item, relationsAuto: auto, relationsManual: manual, relationsHidden: hidden, relationsUpdatedAt: new Date().toISOString() };
});

const nextStore = setItems(store, nextItems);
nextStore.updatedAt = new Date().toISOString();
nextStore.relationsVersion = 1;

console.log(`[Archivo Motorsport] Fichas: ${items.length}`);
console.log(`[Archivo Motorsport] Relaciones automáticas generadas: ${totalRelations}`);

if (DRY_RUN) {
  console.log('[Archivo Motorsport] Dry run activo: no se escribió el storage.');
} else {
  const backupPath = `${STORE_PATH}.backup-relations-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(STORE_PATH, backupPath);
  fs.writeFileSync(STORE_PATH, JSON.stringify(nextStore, null, 2) + '\n', 'utf8');
  console.log(`[Archivo Motorsport] Backup: ${backupPath}`);
  console.log(`[Archivo Motorsport] Storage actualizado: ${STORE_PATH}`);
}
