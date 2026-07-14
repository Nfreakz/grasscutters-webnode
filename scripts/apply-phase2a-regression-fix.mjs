import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase2a-regression-fix-${timestamp}`);
const changed = [];

function file(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  const target = file(relativePath);
  if (!fs.existsSync(target)) throw new Error(`No existe ${relativePath}`);
  return fs.readFileSync(target, 'utf8');
}

function write(relativePath, original, next) {
  if (original === next) return false;
  const backup = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(file(relativePath), backup);
  fs.writeFileSync(file(relativePath), next, 'utf8');
  changed.push(relativePath);
  return true;
}

// 1. Corregir la inserción de technicalTrackCode en el agrupador equivocado
//    y aplicarla únicamente al bucket técnico de home-bootstrap.
{
  const relativePath = 'src/server/index.ts';
  const original = read(relativePath);
  let next = original;

  const wrongBlock = `          rawCode: technicalTrackCode || trackFamily.code,
          rawName: technicalTrackCode || trackFamily.rawName,
          technicalCode: technicalTrackCode || null,
          identitySource: technicalTrackCode ? 'stracker-technical-code' : 'normalized-track',
          familyKey: trackFamily.key,
          variant`;

  const restoredPublicBlock = `          rawCode: trackFamily.code,
          rawName: trackFamily.rawName,
          familyKey: trackFamily.key,
          variant`;

  if (next.includes(wrongBlock)) {
    next = next.replace(wrongBlock, restoredPublicBlock);
  }

  const homeFunctionStart = next.indexOf('function gcHomeBootstrapBuildComboBucketsV1');
  if (homeFunctionStart < 0) {
    throw new Error('No se encontró gcHomeBootstrapBuildComboBucketsV1.');
  }

  const homeFunctionEnd = next.indexOf('\nfunction ', homeFunctionStart + 20);
  const end = homeFunctionEnd >= 0 ? homeFunctionEnd : next.length;
  const before = next.slice(0, homeFunctionStart);
  let homeFunction = next.slice(homeFunctionStart, end);
  const after = next.slice(end);

  const homeOldBlock = `          rawCode: trackFamily.code,
          rawName: trackFamily.rawName,
          familyKey: trackFamily.key,
          variant`;

  const homeFixedBlock = `          rawCode: technicalTrackCode || trackFamily.code,
          rawName: technicalTrackCode || trackFamily.rawName,
          technicalCode: technicalTrackCode || null,
          identitySource: technicalTrackCode ? 'stracker-technical-code' : 'normalized-track',
          familyKey: trackFamily.key,
          variant`;

  if (homeFunction.includes(homeOldBlock)) {
    homeFunction = homeFunction.replace(homeOldBlock, homeFixedBlock);
  } else if (!homeFunction.includes("identitySource: technicalTrackCode ? 'stracker-technical-code'")) {
    throw new Error('No se encontró el objeto track del bucket técnico de la home.');
  }

  next = before + homeFunction + after;

  const technicalUsesBeforeHome = next
    .slice(0, next.indexOf('function gcHomeBootstrapBuildComboBucketsV1'))
    .match(/\btechnicalTrackCode\b/g)?.length || 0;

  if (technicalUsesBeforeHome !== 0) {
    throw new Error(`Quedan ${technicalUsesBeforeHome} usos de technicalTrackCode fuera de su función.`);
  }

  write(relativePath, original, next);
}

// 2. Completar el contrato mínimo del adaptador opcional better-sqlite3.
{
  const relativePath = 'src/db/appDb.ts';
  const original = read(relativePath);
  let next = original;

  const oldType = `type BetterSqlite3Database = {
  pragma(statement: string): unknown;
  exec(statement: string): unknown;
  close?: () => void;
};`;

  const newType = `type BetterSqlite3Statement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
};

type BetterSqlite3Database = {
  pragma(statement: string): unknown;
  exec(statement: string): unknown;
  prepare(statement: string): BetterSqlite3Statement;
  close?: () => void;
};`;

  if (next.includes(oldType)) {
    next = next.replace(oldType, newType);
  } else if (!next.includes('prepare(statement: string): BetterSqlite3Statement;')) {
    throw new Error('No se encontró el tipo BetterSqlite3Database esperado.');
  }

  write(relativePath, original, next);
}

// 3. Evitar inferencias `never` introducidas por estados inicialmente nulos.
{
  const relativePath = 'src/pages/index.astro';
  const original = read(relativePath);
  let next = original;

  const oldState = `      const heroState = { payload: null, index: 0 };
      const lastGood = { bootstrap: null, championships: {} };`;

  const typedState = `      const heroState: { payload: any; index: number } = { payload: null, index: 0 };
      const lastGood: { bootstrap: any; championships: Record<string, any> } = { bootstrap: null, championships: {} };`;

  if (next.includes(oldState)) {
    next = next.replace(oldState, typedState);
  } else if (!next.includes('const heroState: { payload: any; index: number }')) {
    throw new Error('No se encontró el estado del bootstrap de la home.');
  }

  write(relativePath, original, next);
}

console.log('');
console.log('[GC Phase 2A regression fix] Aplicado.');
console.log(`[GC Phase 2A regression fix] Backup: ${backupDir}`);
console.log(`[GC Phase 2A regression fix] Modificados: ${changed.join(', ') || 'ninguno; ya estaba aplicado'}`);
console.log('[GC Phase 2A regression fix] Siguiente: npm run deps:baseline && npm run quality');
