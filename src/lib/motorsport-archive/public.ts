import { readMotorsportArchiveStore } from './storage';
import type { MotorsportArchiveCategory, MotorsportArchiveItem, MotorsportArchiveMedia } from './schema';

export type ArchiveCategoryRoute = {
  key: MotorsportArchiveCategory;
  slug: string;
  label: string;
  singular: string;
  intro: string;
};

export const ARCHIVE_PUBLIC_CATEGORIES: ArchiveCategoryRoute[] = [
  { key: 'circuit', slug: 'circuitos', label: 'Circuitos', singular: 'circuito', intro: 'Trazados con historia, carácter o interés para la comunidad.' },
  { key: 'driver', slug: 'pilotos', label: 'Pilotos', singular: 'piloto', intro: 'Nombres propios del motorsport, de leyenda o de archivo interno.' },
  { key: 'vehicle', slug: 'vehiculos', label: 'Vehículos', singular: 'vehículo', intro: 'Máquinas importantes, curiosas o especialmente reconocibles.' },
  { key: 'championship', slug: 'campeonatos', label: 'Campeonatos', singular: 'campeonato', intro: 'Competiciones, formatos y contextos para ordenar el archivo.' },
  { key: 'record', slug: 'records', label: 'Récords', singular: 'récord', intro: 'Referencias de tiempo, hitos y marcas destacadas.' },
  { key: 'glossary', slug: 'glosario', label: 'Glosario', singular: 'concepto', intro: 'Términos útiles explicados sin ruido.' }
];

export function getArchiveCategoryBySlug(slug: string) {
  return ARCHIVE_PUBLIC_CATEGORIES.find((category) => category.slug === slug) || null;
}

export function getArchiveCategoryByKey(key: MotorsportArchiveCategory) {
  return ARCHIVE_PUBLIC_CATEGORIES.find((category) => category.key === key) || ARCHIVE_PUBLIC_CATEGORIES[0];
}

export function getPublishedArchiveItems(rootDir = process.cwd()) {
  return readMotorsportArchiveStore(rootDir).items
    .filter((item) => item.status === 'published')
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getPublishedArchiveItemsByCategory(category: MotorsportArchiveCategory, rootDir = process.cwd()) {
  return getPublishedArchiveItems(rootDir).filter((item) => item.category === category);
}

export function getPublishedArchiveItemBySlug(categorySlug: string, slug: string, rootDir = process.cwd()) {
  const category = getArchiveCategoryBySlug(categorySlug);
  if (!category) return null;
  return getPublishedArchiveItemsByCategory(category.key, rootDir).find((item) => item.slug === slug) || null;
}

export function getArchiveItemUrl(item: MotorsportArchiveItem) {
  const category = getArchiveCategoryByKey(item.category);
  return `/archivo/${category.slug}/${item.slug}/`;
}

export function getArchiveCover(item: MotorsportArchiveItem): MotorsportArchiveMedia | null {
  const media = Array.isArray(item.media) ? item.media : [];
  return media.find((entry) => entry.isMain && entry.url) || media.find((entry) => entry.url) || null;
}

export function getArchiveCoverUrl(item: MotorsportArchiveItem) {
  return getArchiveCover(item)?.url || '/images/biblia-placeholder.svg';
}

export function getArchiveCoverAlt(item: MotorsportArchiveItem) {
  return getArchiveCover(item)?.alt || item.title;
}

export function getArchiveStats(rootDir = process.cwd()) {
  const items = getPublishedArchiveItems(rootDir);
  return {
    total: items.length,
    categories: ARCHIVE_PUBLIC_CATEGORIES.map((category) => ({
      ...category,
      count: items.filter((item) => item.category === category.key).length
    }))
  };
}

export function searchArchiveItems(query: string, rootDir = process.cwd()) {
  const q = String(query || '').trim().toLowerCase();
  const items = getPublishedArchiveItems(rootDir);
  if (!q) return items.slice(0, 24);
  return items
    .map((item) => {
      const haystack = [item.title, item.summary, item.body, item.slug, ...item.facts.map((fact) => `${fact.label} ${fact.value}`)].join(' ').toLowerCase();
      const score = Number(item.title.toLowerCase().includes(q)) * 6 + Number(item.slug.includes(q)) * 4 + Number(haystack.includes(q));
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .map((entry) => entry.item)
    .slice(0, 24);
}

export function relatedArchiveItems(item: MotorsportArchiveItem, rootDir = process.cwd()) {
  const ids = new Set(item.relatedIds || []);
  const published = getPublishedArchiveItems(rootDir);
  const explicit = published.filter((entry) => ids.has(entry.id));
  const sameCategory = published.filter((entry) => entry.category === item.category && entry.id !== item.id && !ids.has(entry.id));
  return [...explicit, ...sameCategory].slice(0, 4);
}
