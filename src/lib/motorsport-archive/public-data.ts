import fs from 'node:fs';
import path from 'node:path';

export type ArchivePublicItem = Record<string, any>;

function isMysql() {
  const driver = String(process.env.ARCHIVE_STORAGE_DRIVER || process.env.APP_STORAGE_DRIVER || 'json').trim().toLowerCase();
  return driver === 'mysql' || driver === 'mariadb';
}

async function importMysql2() {
  const mod: any = await import('mysql2/promise');
  return mod.default ?? mod;
}

async function getConnection() {
  const host = process.env.MYSQL_HOST?.trim();
  const database = process.env.MYSQL_DATABASE?.trim();
  const user = process.env.MYSQL_USER?.trim();
  const password = process.env.MYSQL_PASSWORD ?? '';
  const port = Number(process.env.MYSQL_PORT || 3306);

  if (!host || !database || !user) throw new Error('Faltan variables MySQL.');

  const mysql = await importMysql2();
  return mysql.createConnection({ host, port, database, user, password, charset: 'utf8mb4', timezone: 'Z' });
}

function getJsonPath(rootDir = process.cwd()) {
  const configured = process.env.ARCHIVE_DATA_PATH?.trim() || process.env.MOTORSPORT_ARCHIVE_PATH?.trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.resolve(rootDir, configured);
  return path.join(rootDir, 'data', 'app', 'motorsport-archive.json');
}

export function normalizeArchiveCategory(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  const map: Record<string, string> = {
    circuit: 'circuitos',
    circuits: 'circuitos',
    circuito: 'circuitos',
    circuitos: 'circuitos',
    track: 'circuitos',

    driver: 'pilotos',
    drivers: 'pilotos',
    pilot: 'pilotos',
    piloto: 'pilotos',
    pilotos: 'pilotos',

    vehicle: 'vehiculos',
    vehicles: 'vehiculos',
    vehiculo: 'vehiculos',
    vehículos: 'vehiculos',
    vehiculos: 'vehiculos',
    car: 'vehiculos',

    championship: 'campeonatos',
    championships: 'campeonatos',
    campeonato: 'campeonatos',
    campeonatos: 'campeonatos',

    record: 'records',
    records: 'records',

    glossary: 'glosario',
    glosario: 'glosario',
    concepto: 'glosario',
  };
  return map[raw] || raw || 'general';
}

export const ARCHIVE_PUBLIC_CATEGORIES = [
  { key: 'circuitos', slug: 'circuitos', label: 'Circuitos', singular: 'Circuito' },
  { key: 'pilotos', slug: 'pilotos', label: 'Pilotos', singular: 'Piloto' },
  { key: 'vehiculos', slug: 'vehiculos', label: 'Vehículos', singular: 'Vehículo' },
  { key: 'campeonatos', slug: 'campeonatos', label: 'Campeonatos', singular: 'Campeonato' },
  { key: 'records', slug: 'records', label: 'Récords', singular: 'Récord' },
  { key: 'glosario', slug: 'glosario', label: 'Glosario', singular: 'Concepto' },
];

function normalizeFacts(value: any) {
  if (Array.isArray(value)) {
    return value.map((fact) => ({
      label: String(fact?.label || fact?.name || '').trim(),
      value: String(fact?.value || '').trim(),
    })).filter((fact) => fact.label && fact.value);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([label, factValue]) => ({ label, value: String(factValue ?? '').trim() }))
      .filter((fact) => fact.label && fact.value);
  }

  return [];
}

function normalizeMedia(item: any) {
  const media = Array.isArray(item.media) ? item.media : [];
  const mapped = media.map((m: any, index: number) => ({
    id: String(m.id || `media-${index}`),
    url: String(m.url || m.localUrl || m.local_url || m.image || '').trim(),
    alt: String(m.alt || m.title || item.title || '').trim(),
    source: String(m.source || '').trim(),
    sourceUrl: String(m.sourceUrl || m.source_url || m.originalUrl || '').trim(),
    author: String(m.author || '').trim(),
    license: String(m.license || '').trim(),
    isPrimary: Boolean(m.isPrimary || m.isMain || m.primary || m.cover),
    isMain: Boolean(m.isMain || m.isPrimary || m.primary || m.cover),
    locked: Boolean(m.locked),
  })).filter((m: any) => m.url);

  const cover = String(item.coverUrl || item.image || item.imageUrl || item.localUrl || '').trim();
  if (cover && !mapped.some((m: any) => m.url === cover)) {
    mapped.unshift({
      id: 'cover',
      url: cover,
      alt: String(item.coverAlt || item.title || '').trim(),
      source: '',
      sourceUrl: '',
      author: '',
      license: '',
      isPrimary: true,
      isMain: true,
      locked: true,
    });
  }

  return mapped.sort((a: any, b: any) => Number(b.isPrimary || b.isMain) - Number(a.isPrimary || a.isMain));
}

export function normalizeArchiveItem(raw: any): ArchivePublicItem {
  const category = normalizeArchiveCategory(raw.category || raw.type);
  const title = String(raw.title || raw.name || raw.nombre || raw.slug || raw.id || 'Ficha sin título').trim();
  const slug = String(raw.slug || '').trim();

  const item = {
    ...raw,
    id: String(raw.id || slug || title).trim(),
    category,
    type: raw.type || category,
    slug,
    title,
    status: String(raw.status || 'draft').trim().toLowerCase(),
    summary: String(raw.summary || raw.resumen || raw.descripcion_corta || raw.description || '').trim(),
    body: String(raw.body || raw.text || raw.descripcion_larga || raw.content || '').trim(),
    facts: normalizeFacts(raw.facts),
    media: [],
    coverUrl: '',
    coverAlt: '',
  } as ArchivePublicItem;

  item.media = normalizeMedia(item);
  item.coverUrl = item.media[0]?.url || '/og/grasscutters-og.svg';
  item.coverAlt = item.media[0]?.alt || item.title;

  return item;
}

async function readMysqlItems() {
  const connection = await getConnection();
  try {
    const [rows] = await connection.execute('SELECT item_json FROM gc_archive_items ORDER BY updated_at DESC');
    return (Array.isArray(rows) ? rows : [])
      .map((row: any) => {
        try { return normalizeArchiveItem(JSON.parse(row.item_json)); }
        catch { return null; }
      })
      .filter(Boolean);
  } finally {
    await connection.end();
  }
}

function readJsonItems() {
  try {
    const filePath = getJsonPath();
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return (Array.isArray(parsed.items) ? parsed.items : []).map(normalizeArchiveItem);
  } catch {
    return [];
  }
}

export async function getArchiveItems() {
  if (isMysql()) return readMysqlItems();
  return readJsonItems();
}

export async function getPublishedArchiveItems() {
  const items = await getArchiveItems();
  return items.filter((item) => String(item.status || '').toLowerCase() === 'published');
}

export async function getArchiveStats() {
  const items = await getPublishedArchiveItems();
  return {
    total: items.length,
    categories: ARCHIVE_PUBLIC_CATEGORIES.map((category) => ({
      ...category,
      count: items.filter((item) => item.category === category.key).length,
    })),
  };
}

export function getArchiveItemUrl(item: ArchivePublicItem) {
  return `/archivo/${normalizeArchiveCategory(item.category || item.type)}/${item.slug}/`;
}

export function getArchiveCoverUrl(item: ArchivePublicItem) {
  return item.coverUrl || item.media?.[0]?.url || '/og/grasscutters-og.svg';
}

export function getArchiveCoverAlt(item: ArchivePublicItem) {
  return item.coverAlt || item.media?.[0]?.alt || item.title || 'Archivo Motorsport';
}

export async function searchArchiveItems(q = '') {
  const query = String(q || '').trim().toLowerCase();
  const items = await getPublishedArchiveItems();

  if (!query) return items;

  return items.filter((item) => {
    const haystack = [
      item.title,
      item.slug,
      item.category,
      item.summary,
      item.body,
      ...(Array.isArray(item.facts) ? item.facts.map((fact: any) => `${fact.label} ${fact.value}`) : []),
    ].join(' ').toLowerCase();

    return haystack.includes(query);
  });
}

export async function findPublishedArchiveItem(category: string, slug: string) {
  const items = await getPublishedArchiveItems();
  const wantedCategory = normalizeArchiveCategory(category);
  const wantedSlug = String(slug || '').trim();

  return items.find((item) => normalizeArchiveCategory(item.category || item.type) === wantedCategory && String(item.slug || '') === wantedSlug) || null;
}
