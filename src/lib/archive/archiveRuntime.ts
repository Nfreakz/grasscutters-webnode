import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import staticArchiveItems from '../../data/archive/items.json';

export type ArchiveItem = Record<string, any> & {
  tipo: string;
  slug: string;
  nombre: string;
  title?: string;
  category?: string;
  status?: string;
};

export type ArchiveTypeSummary = {
  tipo: string;
  label: string;
  count: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = process.env.GC_RUNTIME_ROOT
  ? path.resolve(process.env.GC_RUNTIME_ROOT)
  : path.resolve(__dirname, '../../..');

const KNOWN_PUBLIC_TYPES = new Set(['circuitos', 'coches', 'pilotos', 'campeonatos', 'records', 'glosario', 'general']);

const TYPE_ORDER = ['circuitos', 'coches', 'pilotos', 'campeonatos', 'records', 'glosario', 'general'];

function stripAccents(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function slugify(value: unknown, fallback = 'archivo') {
  return stripAccents(String(value || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 140) || fallback;
}

function normalizeKey(value = '') {
  return slugify(value, '')
    .replace(/-/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeArchiveType(value = ''): string {
  const clean = slugify(value, 'general');

  if (['circuit', 'track', 'circuito', 'circuitos'].includes(clean)) return 'circuitos';
  if (['car', 'cars', 'coche', 'coches', 'vehiculo', 'vehiculos', 'vehicle', 'vehicles'].includes(clean)) return 'coches';
  if (['pilot', 'driver', 'piloto', 'pilotos', 'drivers'].includes(clean)) return 'pilotos';
  if (['championship', 'championships', 'campeonato', 'campeonatos'].includes(clean)) return 'campeonatos';
  if (['record', 'records'].includes(clean)) return 'records';
  if (['glossary', 'glosario'].includes(clean)) return 'glosario';

  return clean || 'general';
}

function storageCategoryForPublicType(value = '') {
  const type = normalizeArchiveType(value);
  if (type === 'coches') return 'vehiculos';
  return type;
}

export function prettifyArchiveType(value = ''): string {
  const type = normalizeArchiveType(value);
  const labels: Record<string, string> = {
    circuitos: 'Circuitos',
    coches: 'Coches',
    pilotos: 'Pilotos',
    campeonatos: 'Campeonatos',
    records: 'Récords',
    glosario: 'Glosario',
    general: 'Archivo',
  };
  return labels[type] || type.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function singularArchiveType(value = ''): string {
  const type = normalizeArchiveType(value);
  const labels: Record<string, string> = {
    circuitos: 'Circuito',
    coches: 'Coche',
    pilotos: 'Piloto',
    campeonatos: 'Campeonato',
    records: 'Récord',
    glosario: 'Entrada de glosario',
    general: 'Ficha',
  };
  return labels[type] || 'Ficha';
}

export function archiveTypeHref(value = ''): string {
  return `/archivo/${normalizeArchiveType(value)}/`;
}

export function archiveItemHref(item: Pick<ArchiveItem, 'tipo' | 'slug'>): string {
  return `/archivo/${normalizeArchiveType(item?.tipo || 'general')}/${String(item?.slug || '').trim()}/`;
}

function isVisiblePublicItem(item: any) {
  const status = String(item?.status || item?.estado || '').trim().toLowerCase();
  return !status || status === 'published' || status === 'publicado' || status === 'public';
}

function useMysqlArchiveStorage() {
  const driver = String(process.env.ARCHIVE_STORAGE_DRIVER || process.env.APP_STORAGE_DRIVER || 'json').trim().toLowerCase();
  return driver === 'mysql' || driver === 'mariadb';
}

async function importMysql2() {
  const mod: any = await import('mysql2/promise');
  return mod.default ?? mod;
}

async function getMysqlConnection() {
  const host = process.env.MYSQL_HOST?.trim();
  const database = process.env.MYSQL_DATABASE?.trim();
  const user = process.env.MYSQL_USER?.trim();
  const password = process.env.MYSQL_PASSWORD ?? '';
  const port = Number(process.env.MYSQL_PORT || 3306);

  if (!host || !database || !user) throw new Error('Faltan variables MySQL para Archivo.');

  const mysql = await importMysql2();
  return mysql.createConnection({
    host,
    port,
    database,
    user,
    password,
    charset: 'utf8mb4',
    timezone: 'Z',
  });
}

function archiveJsonPath() {
  const configured = process.env.ARCHIVE_DATA_PATH?.trim() || process.env.MOTORSPORT_ARCHIVE_PATH?.trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.resolve(rootDir, configured);
  return path.join(rootDir, 'data', 'app', 'motorsport-archive.json');
}

function safeJsonParse(value: string, fallback: any) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function listFromDelimited(value: any) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '')
    .split(/\|\||\n|;/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getMedia(item: any) {
  const media = Array.isArray(item?.media) ? item.media : [];
  return media
    .map((entry: any) => ({
      ...entry,
      url: String(entry?.url || entry?.localUrl || '').trim(),
      localUrl: String(entry?.localUrl || entry?.url || '').trim(),
    }))
    .filter((entry: any) => entry.url || entry.localUrl);
}

function getMainMedia(item: any) {
  const media = getMedia(item);
  return media.find((entry: any) => entry.isMain || entry.isPrimary) || media[0] || null;
}

function mergeFactFields(raw: any) {
  const output: Record<string, any> = { ...(raw || {}) };
  const facts = Array.isArray(raw?.facts) ? raw.facts : [];

  const aliases: Record<string, string> = {
    pais: 'pais',
    pais_origen: 'pais',
    country: 'pais',
    region: 'region',
    ubicacion: 'ubicacion',
    localizacion: 'ubicacion',
    categoria: 'categoria',
    categoria_competicion: 'categoria_competicion',
    periodo: 'periodo',
    epoca: 'epoca',
    disciplina: 'disciplina',
    longitud: 'longitud_km',
    longitud_km: 'longitud_km',
    length_km: 'longitud_km',
    curvas: 'curvas',
    corners: 'curvas',
    sentido: 'sentido',
    apertura: 'fecha_apertura',
    fecha_apertura: 'fecha_apertura',
    fabricante: 'fabricante',
    modelo_base: 'modelo_base',
    constructor: 'constructor',
    motor: 'motor',
    cilindrada: 'cilindrada',
    potencia: 'potencia',
    peso: 'peso',
    traccion: 'traccion',
    transmision: 'transmision',
    nacionalidad: 'nacionalidad',
    nacimiento: 'fecha_nacimiento',
    fecha_nacimiento: 'fecha_nacimiento',
    lugar_nacimiento: 'lugar_nacimiento',
    equipos: 'equipos',
    titulos: 'titulos',
    victorias: 'victorias',
    podios: 'podios',
  };

  for (const fact of facts) {
    const label = String(fact?.label || fact?.title || fact?.name || '').trim();
    const value = String(fact?.value || fact?.text || fact?.content || '').trim();
    if (!label || !value) continue;

    const key = normalizeKey(label);
    const target = aliases[key] || key;
    if (target && output[target] === undefined) output[target] = value;
  }

  return output;
}

function normalizeSources(item: any) {
  const explicit = item.fuentes || item.sources;
  if (explicit) return explicit;

  const facts = Array.isArray(item.facts) ? item.facts : [];
  const sourceFacts = facts
    .filter((fact: any) => {
      const label = String(fact?.label || fact?.title || '').toLowerCase();
      return label.includes('fuente') || label.includes('source');
    })
    .map((fact: any) => {
      const label = String(fact?.label || 'Fuente').trim();
      const value = String(fact?.value || fact?.text || '').trim();
      return value ? `${label}::${value}` : '';
    })
    .filter(Boolean);

  return sourceFacts.join('||');
}

export function normalizeArchiveItem(rawItem: any): ArchiveItem {
  const raw = mergeFactFields(rawItem || {});
  const rawType = raw.tipo || raw.tipo_importacion || raw.category || raw.type || raw.categoria_tipo || raw.collection || 'general';
  const tipo = normalizeArchiveType(rawType);
  const title = String(raw.nombre || raw.title || raw.titulo || raw.name || 'Ficha sin título').trim();
  const slug = slugify(raw.slug || title);
  const media = getMedia(raw);
  const mainMedia = getMainMedia(raw);
  const summary = String(raw.descripcion_corta || raw.summary || raw.resumen || raw.subtitulo || raw.excerpt || raw.body || '').trim();
  const body = String(raw.introduccion || raw.body || raw.descripcion_larga || raw.description_long || raw.descripcion || raw.texto || '').trim();
  const rawCategoryType = normalizeArchiveType(raw.category || raw.type || raw.tipo || '');
  const rawDetailType = normalizeArchiveType(raw.categoria || '');
  const semanticCategory =
    raw.categoria && !KNOWN_PUBLIC_TYPES.has(rawDetailType)
      ? raw.categoria
      : raw.categoria_competicion || raw.categoryLabel || raw.detailCategory || (rawCategoryType && rawCategoryType !== tipo ? raw.category : '') || '';

  return {
    ...raw,
    tipo,
    publicTipo: tipo,
    storageCategory: raw.category || storageCategoryForPublicType(tipo),
    slug,
    nombre: title,
    title,
    status: raw.status || raw.estado || '',
    descripcion_corta: summary,
    summary,
    subtitulo: raw.subtitulo || summary,
    introduccion: body || raw.introduccion || '',
    body: raw.body || body,
    categoria: raw.categoria || semanticCategory || '',
    media,
    imagen_url: raw.imagen_url || raw.image_url || raw.coverUrl || mainMedia?.url || mainMedia?.localUrl || '',
    imagen_alt: raw.imagen_alt || raw.image_alt || raw.coverAlt || mainMedia?.alt || title,
    imagen_credito: raw.imagen_credito || raw.image_credit || mainMedia?.source || '',
    imagen_licencia: raw.imagen_licencia || raw.image_license || mainMedia?.license || '',
    coverUrl: raw.coverUrl || raw.imagen_url || mainMedia?.url || mainMedia?.localUrl || '',
    coverAlt: raw.coverAlt || raw.imagen_alt || mainMedia?.alt || title,
    fuentes: normalizeSources(raw),
  };
}

async function readMysqlArchiveItems() {
  const connection = await getMysqlConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT id, category, slug, title, status, item_json, updated_at
       FROM gc_archive_items
       ORDER BY updated_at DESC`
    );

    return (Array.isArray(rows) ? rows : []).map((row: any) => {
      const parsed = safeJsonParse(String(row.item_json || '{}'), {});
      return normalizeArchiveItem({
        ...parsed,
        id: parsed.id || row.id,
        category: parsed.category || row.category,
        slug: parsed.slug || row.slug,
        title: parsed.title || row.title,
        status: parsed.status || row.status,
        updatedAt: parsed.updatedAt || row.updated_at,
      });
    });
  } finally {
    await connection.end();
  }
}

function readJsonArchiveItems() {
  const filePath = archiveJsonPath();
  if (!fs.existsSync(filePath)) return [];

  const parsed = safeJsonParse(fs.readFileSync(filePath, 'utf8'), null);
  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
  return items.map(normalizeArchiveItem);
}

function readStaticArchiveItems() {
  return (staticArchiveItems as ArchiveItem[]).map(normalizeArchiveItem);
}

async function readArchiveItemsRaw() {
  if (useMysqlArchiveStorage()) {
    try {
      const mysqlItems = await readMysqlArchiveItems();
      if (mysqlItems.length) return mysqlItems;
    } catch (error) {
      console.warn('[GC Archivo] No se pudo leer MySQL. Se usará JSON/estático como fallback.', error);
    }
  }

  const jsonItems = readJsonArchiveItems();
  if (jsonItems.length) return jsonItems;

  return readStaticArchiveItems();
}

export async function getArchiveItems(options: { includeDrafts?: boolean } = {}): Promise<ArchiveItem[]> {
  const items = await readArchiveItemsRaw();
  return items
    .filter((item) => options.includeDrafts || isVisiblePublicItem(item))
    .filter((item) => item.slug && item.nombre)
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

export async function getArchiveTypes(): Promise<ArchiveTypeSummary[]> {
  const items = await getArchiveItems();
  const map = new Map<string, ArchiveTypeSummary>();

  for (const item of items) {
    const tipo = normalizeArchiveType(item.tipo);
    const current = map.get(tipo) || { tipo, label: prettifyArchiveType(tipo), count: 0 };
    current.count += 1;
    map.set(tipo, current);
  }

  return [...map.values()].sort((a, b) => {
    const ai = TYPE_ORDER.indexOf(a.tipo);
    const bi = TYPE_ORDER.indexOf(b.tipo);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.label.localeCompare(b.label, 'es');
  });
}

export async function getArchiveItemsByType(tipo: string): Promise<ArchiveItem[]> {
  const normalized = normalizeArchiveType(tipo);
  return (await getArchiveItems()).filter((item) => normalizeArchiveType(item.tipo) === normalized);
}

export async function getArchiveItem(tipo: string, slug: string): Promise<ArchiveItem | undefined> {
  const normalized = normalizeArchiveType(tipo);
  const cleanSlug = String(slug || '').trim();
  return (await getArchiveItems()).find((item) => normalizeArchiveType(item.tipo) === normalized && item.slug === cleanSlug);
}

export async function getRelatedArchiveItems(entry: ArchiveItem, limit = 6): Promise<ArchiveItem[]> {
  const tags = listFromDelimited(entry.tags)
    .map((tag) => String(tag).trim().toLowerCase())
    .filter(Boolean);

  const items = await getArchiveItems();

  return items
    .filter((item) => item.slug !== entry.slug)
    .map((item) => {
      let score = 0;
      if (normalizeArchiveType(item.tipo) === normalizeArchiveType(entry.tipo)) score += 4;
      if (item.pais && entry.pais && String(item.pais).toLowerCase() === String(entry.pais).toLowerCase()) score += 2;

      const itemTags = String(item.tags || '').toLowerCase();
      for (const tag of tags) if (itemTags.includes(tag)) score += 1;

      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || String(a.item.nombre).localeCompare(String(b.item.nombre), 'es'))
    .slice(0, limit)
    .map(({ item }) => item);
}

export async function getArchiveStats() {
  const items = await getArchiveItems();
  const types = await getArchiveTypes();

  return {
    total: items.length,
    circuits: items.filter((item) => normalizeArchiveType(item.tipo) === 'circuitos').length,
    cars: items.filter((item) => normalizeArchiveType(item.tipo) === 'coches').length,
    pilots: items.filter((item) => normalizeArchiveType(item.tipo) === 'pilotos').length,
    items,
    types,
  };
}
