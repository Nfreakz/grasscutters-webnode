import fs from 'node:fs';
import path from 'node:path';
import staticArchiveItems from '../../data/archive/items.json';

export type ArchiveItem = Record<string, any> & {
  id?: string;
  tipo: string;
  category?: string;
  slug: string;
  nombre: string;
  title: string;
  status?: string;
};

type ArchiveTypeSummary = {
  tipo: string;
  label: string;
  singular: string;
  href: string;
  count: number;
};

const PUBLIC_TYPE_ORDER = ['circuitos', 'coches', 'pilotos', 'glosario'];

const TYPE_LABELS: Record<string, { label: string; singular: string; lead: string }> = {
  circuitos: {
    label: 'Circuitos',
    singular: 'Circuito',
    lead: 'Trazados, zonas clave, carácter de conducción, historia y referencias técnicas.',
  },
  coches: {
    label: 'Coches',
    singular: 'Coche',
    lead: 'Modelos, versiones de competición, mecánica, historial deportivo y contexto.',
  },
  pilotos: {
    label: 'Pilotos',
    singular: 'Piloto',
    lead: 'Trayectorias, estilo, palmarés, coches asociados y momentos importantes.',
  },
  glosario: {
    label: 'Glosario',
    singular: 'Concepto',
    lead: 'Conceptos técnicos, históricos y de pilotaje explicados de forma clara.',
  },
  general: {
    label: 'Archivo',
    singular: 'Ficha',
    lead: 'Fichas técnicas e históricas organizadas por categorías.',
  },
};

function appRootDir() {
  return process.env.GC_RUNTIME_ROOT?.trim()
    ? path.resolve(process.env.GC_RUNTIME_ROOT.trim())
    : process.cwd();
}

function mysqlEnabled() {
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

  if (!host || !database || !user) throw new Error('Faltan variables MySQL para leer el Archivo.');

  const mysql = await importMysql2();
  return mysql.createConnection({ host, port, database, user, password, charset: 'utf8mb4', timezone: 'Z' });
}

function runtimeJsonPath() {
  const configured = process.env.ARCHIVE_DATA_PATH?.trim() || process.env.MOTORSPORT_ARCHIVE_PATH?.trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.resolve(appRootDir(), configured);
  return path.join(appRootDir(), 'data', 'app', 'motorsport-archive.json');
}

function normalizeBase(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function publicTypeFromValue(value: unknown): string {
  const raw = normalizeBase(value);

  if (['circuit', 'track', 'circuito', 'circuitos'].includes(raw)) return 'circuitos';
  if (['vehicle', 'vehicles', 'car', 'cars', 'coche', 'coches', 'vehiculo', 'vehiculos'].includes(raw)) return 'coches';
  if (['pilot', 'driver', 'piloto', 'pilotos'].includes(raw)) return 'pilotos';
  if (['glossary', 'glosario', 'concepto', 'conceptos'].includes(raw)) return 'glosario';

  /*
    Desde v15.10, campeonatos y récords dejan de ser categorías públicas propias.
    Se integran como información dentro de circuitos, coches o pilotos.
  */
  if (['championship', 'campeonato', 'campeonatos', 'record', 'records', 'récord', 'récords'].includes(raw)) return 'general';

  const slug = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'general';
}

function internalCategoryFromPublicType(value: unknown): string {
  const type = publicTypeFromValue(value);
  if (type === 'coches') return 'vehiculos';
  return type;
}

function itemRawType(item: any): string {
  return String(item?.tipo || item?.category || item?.categoria_tipo || item?.tipo_importacion || item?.collection || item?.type || '');
}

function isPublicStatus(item: any) {
  const status = String(item?.status || item?.estado || '').trim().toLowerCase();
  if (!status) return true;
  return ['published', 'publicado', 'visible'].includes(status);
}

export function normalizeArchiveType(value = ''): string {
  return publicTypeFromValue(value);
}

export function prettifyArchiveType(value = ''): string {
  const type = normalizeArchiveType(value);
  if (TYPE_LABELS[type]) return TYPE_LABELS[type].label;

  const clean = String(value || '').replace(/-/g, ' ').trim();
  if (!clean) return 'Archivo';
  return clean.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function singularArchiveType(value = ''): string {
  const type = normalizeArchiveType(value);
  return TYPE_LABELS[type]?.singular || 'Ficha';
}

export function archiveTypeLead(value = ''): string {
  const type = normalizeArchiveType(value);
  return TYPE_LABELS[type]?.lead || TYPE_LABELS.general.lead;
}

export function archiveTypeHref(value = ''): string {
  return `/archivo/${normalizeArchiveType(value)}/`;
}

export function archiveItemHref(item: any): string {
  const type = normalizeArchiveType(item?.tipo || item?.category || item?.type || 'general');
  const slug = String(item?.slug || '').trim();
  return `/archivo/${type}/${slug}/`;
}

export function getArchiveSummary(item: any): string {
  return String(item?.descripcion_corta || item?.summary || item?.subtitulo || item?.excerpt || item?.body || '').trim();
}

export function getArchivePeriod(item: any): string {
  return String(item?.periodo || item?.epoca || item?.años_actividad || item?.anos_actividad || item?.fecha_apertura || '').trim();
}

export function getArchiveCountry(item: any): string {
  return String(item?.pais || item?.país || item?.nacionalidad || item?.ubicacion || item?.ubicación || '').trim();
}

export function getArchiveImage(item: any): string {
  const media = Array.isArray(item?.media) ? item.media : [];
  const main = media.find((entry: any) => entry?.isMain || entry?.isPrimary) || media[0];
  return String(item?.coverUrl || item?.imagen_url || item?.image_url || main?.url || main?.localUrl || '').trim();
}

function normalizeFacts(value: any) {
  if (Array.isArray(value)) {
    return value
      .map((fact) => ({ label: String(fact?.label || fact?.name || '').trim(), value: String(fact?.value || fact?.text || '').trim() }))
      .filter((fact) => fact.label && fact.value);
  }

  if (!value || typeof value !== 'object') return [];

  return Object.entries(value)
    .map(([label, factValue]) => ({ label: String(label || '').replace(/_/g, ' ').trim(), value: String(factValue ?? '').trim() }))
    .filter((fact) => fact.label && fact.value);
}

function normalizeMedia(value: any) {
  if (!Array.isArray(value)) return [];
  return value
    .map((media) => ({
      ...media,
      url: String(media?.url || media?.localUrl || '').trim(),
      localUrl: String(media?.localUrl || media?.url || '').trim(),
      alt: String(media?.alt || '').trim(),
      source: String(media?.source || '').trim(),
      sourceUrl: String(media?.sourceUrl || media?.originalUrl || media?.url || '').trim(),
      author: String(media?.author || '').trim(),
      license: String(media?.license || '').trim(),
      isMain: Boolean(media?.isMain || media?.isPrimary),
      isPrimary: Boolean(media?.isPrimary || media?.isMain),
    }))
    .filter((media) => media.url || media.localUrl);
}

function normalizeRelations(value: any) {
  if (!value || typeof value !== 'object') return { auto: [], manual: [], hidden: [], pinned: [] };
  return {
    auto: Array.isArray(value.auto) ? value.auto : [],
    manual: Array.isArray(value.manual) ? value.manual : [],
    hidden: Array.isArray(value.hidden) ? value.hidden : [],
    pinned: Array.isArray(value.pinned) ? value.pinned : [],
  };
}

function displayCategoryFor(item: any, publicType: string) {
  const specific = String(item?.categoria || item?.categoria_competicion || item?.tipo_trazado || '').trim();
  if (specific) return specific;
  return singularArchiveType(publicType);
}

function inferTypeForLegacyEntry(input: any, publicType: string) {
  /*
    Si una ficha antigua venía marcada como records/campeonatos, no se publica
    como categoría propia. Se intenta recolocar por contenido.
  */
  const raw = normalizeBase(itemRawType(input));
  if (!['record', 'records', 'campeonato', 'campeonatos', 'championship'].includes(raw)) return publicType;

  const haystack = normalizeBase([
    input.fabricante,
    input.motor,
    input.modelo_base,
    input.coches_asociados,
    input.equipos,
    input.circuitos_asociados,
    input.zonas_clave,
    input.longitud_km,
    input.curvas,
    input.pilotos_asociados,
    input.trayectoria,
    input.palmares,
  ].join(' '));

  if (input.fabricante || input.motor || input.modelo_base || haystack.includes('coche')) return 'coches';
  if (input.longitud_km || input.curvas || input.zonas_clave || haystack.includes('circuit')) return 'circuitos';
  if (input.palmares || input.trayectoria || input.nacionalidad || haystack.includes('piloto')) return 'pilotos';
  return 'general';
}

function normalizeArchiveItem(input: any): ArchiveItem | null {
  if (!input || typeof input !== 'object') return null;

  const initialType = normalizeArchiveType(itemRawType(input));
  const publicType = inferTypeForLegacyEntry(input, initialType);
  const title = String(input.nombre || input.title || input.titulo || input.name || '').trim();
  const slug = String(input.slug || '').trim();

  if (!title || !slug) return null;

  const media = normalizeMedia(input.media);
  const cover = getArchiveImage({ ...input, media });

  const item: ArchiveItem = {
    ...input,
    id: String(input.id || `${publicType}-${slug}`),
    tipo: publicType,
    publicType,
    sourceCategory: String(input.category || input.type || input.tipo || ''),
    category: internalCategoryFromPublicType(publicType),
    categoria: displayCategoryFor(input, publicType),
    slug,
    nombre: title,
    title,
    status: String(input.status || input.estado || ''),
    summary: String(input.summary || input.descripcion_corta || input.subtitulo || '').trim(),
    descripcion_corta: String(input.descripcion_corta || input.summary || input.subtitulo || '').trim(),
    subtitulo: String(input.subtitulo || input.summary || input.descripcion_corta || '').trim(),
    body: String(input.body || input.descripcion_larga || input.introduccion || '').trim(),
    facts: normalizeFacts(input.facts),
    media,
    relations: normalizeRelations(input.relations),
    coverUrl: String(input.coverUrl || cover || '').trim(),
    coverAlt: String(input.coverAlt || input.imagen_alt || title).trim(),
  };

  return item;
}

async function readMysqlItems(): Promise<ArchiveItem[]> {
  const connection = await getMysqlConnection();

  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS gc_archive_items (
        id VARCHAR(120) NOT NULL PRIMARY KEY,
        category VARCHAR(60) NOT NULL,
        slug VARCHAR(160) NOT NULL,
        title VARCHAR(255) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'draft',
        item_json LONGTEXT NOT NULL,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        UNIQUE KEY uniq_gc_archive_category_slug (category, slug),
        INDEX idx_gc_archive_status (status),
        INDEX idx_gc_archive_category (category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [rows] = await connection.execute('SELECT id, category, slug, title, status, item_json, updated_at FROM gc_archive_items ORDER BY updated_at DESC');

    return (Array.isArray(rows) ? rows : [])
      .map((row: any) => {
        try {
          const parsed = JSON.parse(row.item_json || '{}');
          return normalizeArchiveItem({ ...parsed, id: parsed.id || row.id, category: parsed.category || row.category, slug: parsed.slug || row.slug, title: parsed.title || row.title, status: parsed.status || row.status });
        } catch {
          return normalizeArchiveItem({ id: row.id, category: row.category, slug: row.slug, title: row.title, status: row.status });
        }
      })
      .filter(Boolean) as ArchiveItem[];
  } finally {
    await connection.end();
  }
}

function readRuntimeJsonItems(): ArchiveItem[] {
  const filePath = runtimeJsonPath();
  if (!fs.existsSync(filePath)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const rawItems = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
    return rawItems.map(normalizeArchiveItem).filter(Boolean) as ArchiveItem[];
  } catch {
    return [];
  }
}

function readStaticItems(): ArchiveItem[] {
  return (Array.isArray(staticArchiveItems) ? staticArchiveItems : [])
    .map(normalizeArchiveItem)
    .filter(Boolean) as ArchiveItem[];
}

let cache: { at: number; items: ArchiveItem[] } | null = null;

export async function getArchiveItems(options: { includeDrafts?: boolean; fresh?: boolean } = {}): Promise<ArchiveItem[]> {
  const includeDrafts = Boolean(options.includeDrafts);
  const now = Date.now();

  if (!options.fresh && cache && now - cache.at < 10_000) {
    return includeDrafts ? cache.items : cache.items.filter(isPublicStatus);
  }

  let items: ArchiveItem[] = [];

  if (mysqlEnabled()) {
    try {
      items = await readMysqlItems();
    } catch (error) {
      console.warn('[GC Archive] No se pudo leer MySQL, usando fallback JSON/estático:', error instanceof Error ? error.message : String(error));
    }
  }

  if (!items.length) items = readRuntimeJsonItems();
  if (!items.length) items = readStaticItems();

  items = items
    .filter((item) => item.slug && item.nombre)
    .filter((item) => PUBLIC_TYPE_ORDER.includes(normalizeArchiveType(item.tipo)) || normalizeArchiveType(item.tipo) === 'general')
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));

  cache = { at: now, items };
  return includeDrafts ? items : items.filter(isPublicStatus);
}

export async function getArchiveTypes(): Promise<ArchiveTypeSummary[]> {
  const items = await getArchiveItems();
  const counts = new Map<string, number>();

  for (const item of items) {
    const type = normalizeArchiveType(item.tipo || item.category);
    if (!PUBLIC_TYPE_ORDER.includes(type)) continue;
    counts.set(type, (counts.get(type) || 0) + 1);
  }

  return PUBLIC_TYPE_ORDER.map((tipo) => ({
    tipo,
    label: prettifyArchiveType(tipo),
    singular: singularArchiveType(tipo),
    href: archiveTypeHref(tipo),
    count: counts.get(tipo) || 0,
  }));
}

export async function getArchiveItemsByType(tipo: string): Promise<ArchiveItem[]> {
  const normalized = normalizeArchiveType(tipo);
  const items = await getArchiveItems();
  return items.filter((item) => normalizeArchiveType(item.tipo || item.category) === normalized);
}

export async function getArchiveItem(tipo: string, slug: string): Promise<ArchiveItem | undefined> {
  const normalized = normalizeArchiveType(tipo);
  const cleanSlug = String(slug || '').trim();
  const items = await getArchiveItems();
  return items.find((item) => normalizeArchiveType(item.tipo || item.category) === normalized && item.slug === cleanSlug);
}

export async function findArchiveItem(tipo: string, slug: string): Promise<ArchiveItem | undefined> {
  return getArchiveItem(tipo, slug);
}

export async function getArchiveItemBySlug(tipo: string, slug: string): Promise<ArchiveItem | undefined> {
  return getArchiveItem(tipo, slug);
}

function relationKey(value: any): string {
  return String(value?.id || value?.targetId || value?.target || value?.slug || value || '').trim();
}

function relationTargets(entry: ArchiveItem, allItems: ArchiveItem[]): ArchiveItem[] {
  const relations = normalizeRelations(entry.relations);
  const hidden = new Set(relations.hidden.map(relationKey).filter(Boolean));

  const byId = new Map<string, ArchiveItem>();
  const bySlug = new Map<string, ArchiveItem>();

  for (const item of allItems) {
    if (item.id) byId.set(String(item.id), item);
    if (item.slug) bySlug.set(String(item.slug), item);
  }

  const output: ArchiveItem[] = [];
  const seen = new Set<string>();

  const pushByKey = (key: string) => {
    if (!key || hidden.has(key) || seen.has(key)) return;
    const item = byId.get(key) || bySlug.get(key);
    if (!item || item.slug === entry.slug) return;
    seen.add(key);
    if (item.id) seen.add(String(item.id));
    if (item.slug) seen.add(String(item.slug));
    output.push(item);
  };

  for (const relation of relations.pinned) pushByKey(relationKey(relation));
  for (const relation of relations.manual) pushByKey(relationKey(relation));

  return output;
}

export async function getRelatedArchiveItems(entry: ArchiveItem, limit = 6): Promise<ArchiveItem[]> {
  const entryType = normalizeArchiveType(entry.tipo || entry.category);
  const tags = String(entry.tags || '').split(/\|\||;|,/g).map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  const items = await getArchiveItems();
  const manual = relationTargets(entry, items);
  const manualIds = new Set(manual.flatMap((item) => [String(item.id || ''), String(item.slug || '')]).filter(Boolean));
  const hidden = new Set(normalizeRelations(entry.relations).hidden.map(relationKey).filter(Boolean));

  const auto = items
    .filter((item) => item.slug !== entry.slug)
    .filter((item) => !manualIds.has(String(item.id || '')) && !manualIds.has(String(item.slug || '')))
    .filter((item) => !hidden.has(String(item.id || '')) && !hidden.has(String(item.slug || '')))
    .map((item) => {
      let score = 0;
      if (normalizeArchiveType(item.tipo || item.category) === entryType) score += 4;
      if (getArchiveCountry(item) && getArchiveCountry(entry) && normalizeBase(getArchiveCountry(item)) === normalizeBase(getArchiveCountry(entry))) score += 2;
      const itemTags = String(item.tags || '').toLowerCase();
      for (const tag of tags) if (itemTags.includes(tag)) score += 1;
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || String(a.item.nombre).localeCompare(String(b.item.nombre), 'es'))
    .map(({ item }) => item);

  return [...manual, ...auto].slice(0, limit);
}

export async function getArchiveStats() {
  const items = await getArchiveItems();
  const types = await getArchiveTypes();

  return {
    total: items.length,
    items,
    types,
    categories: types,
    circuits: items.filter((item) => normalizeArchiveType(item.tipo) === 'circuitos').length,
    cars: items.filter((item) => normalizeArchiveType(item.tipo) === 'coches').length,
    pilots: items.filter((item) => normalizeArchiveType(item.tipo) === 'pilotos').length,
    glossary: items.filter((item) => normalizeArchiveType(item.tipo) === 'glosario').length,
  };
}

export async function searchArchiveItems(query = ''): Promise<ArchiveItem[]> {
  const q = normalizeBase(query);
  const items = await getArchiveItems();
  if (!q) return items;

  return items.filter((item) => {
    const haystack = [
      item.nombre,
      item.title,
      item.slug,
      item.tipo,
      prettifyArchiveType(item.tipo),
      getArchiveSummary(item),
      getArchiveCountry(item),
      getArchivePeriod(item),
      item.tags,
      item.disciplina,
      item.categoria,
      item.fabricante,
      item.motor,
      item.equipos,
      item.eventos_destacados,
      item.zonas_clave,
      item.campeonatos,
      item.records_destacados,
      item.palmares,
    ].flat().join(' ');

    return normalizeBase(haystack).includes(q);
  });
}

export async function getPublishedArchiveItems(): Promise<ArchiveItem[]> {
  return getArchiveItems();
}

export async function getArchivePageData(tipo: string, slug: string) {
  const entry = await getArchiveItem(tipo, slug);
  const related = entry ? await getRelatedArchiveItems(entry) : [];
  return { entry, related };
}
