export type MotorsportArchiveCategory = 'circuit' | 'driver' | 'vehicle' | 'championship' | 'record' | 'glossary';
export type MotorsportArchiveStatus = 'draft' | 'published' | 'hidden';

export type MotorsportArchiveFact = {
  label: string;
  value: string;
};

export type MotorsportArchiveMedia = {
  id: string;
  type: 'cover' | 'photo' | 'map' | 'plan' | 'svg' | 'other';
  url: string;
  alt: string;
  source: string;
  sourceUrl: string;
  author: string;
  license: string;
  isMain: boolean;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MotorsportArchiveItem = {
  id: string;
  category: MotorsportArchiveCategory;
  slug: string;
  title: string;
  status: MotorsportArchiveStatus;
  summary: string;
  body: string;
  facts: MotorsportArchiveFact[];
  media: MotorsportArchiveMedia[];
  relatedIds: string[];
  seoTitle: string;
  seoDescription: string;
  createdAt: string;
  updatedAt: string;
};

export type MotorsportArchiveStore = {
  version: 1;
  updatedAt: string;
  items: MotorsportArchiveItem[];
};

export const MOTORSPORT_ARCHIVE_CATEGORIES: { value: MotorsportArchiveCategory; label: string }[] = [
  { value: 'circuit', label: 'Circuito' },
  { value: 'driver', label: 'Piloto' },
  { value: 'vehicle', label: 'Vehículo' },
  { value: 'championship', label: 'Campeonato' },
  { value: 'record', label: 'Récord' },
  { value: 'glossary', label: 'Glosario' }
];

export function slugifyArchive(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function createEmptyMotorsportArchiveStore(): MotorsportArchiveStore {
  return { version: 1, updatedAt: new Date().toISOString(), items: [] };
}

export function normalizeMotorsportArchiveItem(input: Partial<MotorsportArchiveItem>): MotorsportArchiveItem {
  const now = new Date().toISOString();
  const title = String(input.title || '').trim() || 'Ficha sin título';
  const slug = slugifyArchive(String(input.slug || title));
  const id = String(input.id || `${input.category || 'item'}-${slug || cryptoRandomId()}`);
  const category = isCategory(input.category) ? input.category : 'circuit';
  const status = isStatus(input.status) ? input.status : 'draft';

  return {
    id,
    category,
    slug: slug || id,
    title,
    status,
    summary: String(input.summary || '').trim(),
    body: String(input.body || '').trim(),
    facts: Array.isArray(input.facts)
      ? input.facts.map((fact) => ({ label: String(fact.label || '').trim(), value: String(fact.value || '').trim() })).filter((fact) => fact.label || fact.value)
      : [],
    media: Array.isArray(input.media)
      ? input.media.map(normalizeMotorsportArchiveMedia).filter((media) => media.url)
      : [],
    relatedIds: Array.isArray(input.relatedIds) ? input.relatedIds.map(String).filter(Boolean) : [],
    seoTitle: String(input.seoTitle || '').trim(),
    seoDescription: String(input.seoDescription || '').trim(),
    createdAt: String(input.createdAt || now),
    updatedAt: now
  };
}

export function normalizeMotorsportArchiveMedia(input: Partial<MotorsportArchiveMedia>): MotorsportArchiveMedia {
  const now = new Date().toISOString();
  const url = String(input.url || '').trim();
  return {
    id: String(input.id || `media-${cryptoRandomId()}`),
    type: isMediaType(input.type) ? input.type : 'photo',
    url,
    alt: String(input.alt || '').trim(),
    source: String(input.source || '').trim(),
    sourceUrl: String(input.sourceUrl || '').trim(),
    author: String(input.author || '').trim(),
    license: String(input.license || '').trim(),
    isMain: Boolean(input.isMain),
    locked: Boolean(input.locked),
    createdAt: String(input.createdAt || now),
    updatedAt: now
  };
}

function cryptoRandomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function isCategory(value: unknown): value is MotorsportArchiveCategory {
  return ['circuit', 'driver', 'vehicle', 'championship', 'record', 'glossary'].includes(String(value));
}

function isStatus(value: unknown): value is MotorsportArchiveStatus {
  return ['draft', 'published', 'hidden'].includes(String(value));
}

function isMediaType(value: unknown): value is MotorsportArchiveMedia['type'] {
  return ['cover', 'photo', 'map', 'plan', 'svg', 'other'].includes(String(value));
}
