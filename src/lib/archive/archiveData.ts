import archiveItems from '../../data/archive/items.json';

export type ArchiveItem = Record<string, any> & {
  tipo: string;
  slug: string;
  nombre: string;
};

export function normalizeArchiveType(value = ''): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'ficha';
}

export function prettifyArchiveType(value = ''): string {
  const clean = String(value || '').replace(/-/g, ' ').trim();
  if (!clean) return 'Archivo';
  return clean.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getArchiveItems(): ArchiveItem[] {
  return (archiveItems as ArchiveItem[])
    .filter((item) => item && item.slug && item.nombre)
    .map((item) => ({
      ...item,
      tipo: normalizeArchiveType(item.tipo || item.tipo_importacion || item.categoria_tipo),
    }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

export function getArchiveTypes() {
  const items = getArchiveItems();
  const map = new Map<string, { tipo: string; label: string; count: number }>();
  for (const item of items) {
    const tipo = normalizeArchiveType(item.tipo);
    const current = map.get(tipo) || { tipo, label: prettifyArchiveType(tipo), count: 0 };
    current.count += 1;
    map.set(tipo, current);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

export function getArchiveItemsByType(tipo: string): ArchiveItem[] {
  const normalized = normalizeArchiveType(tipo);
  return getArchiveItems().filter((item) => normalizeArchiveType(item.tipo) === normalized);
}

export function getArchiveItem(tipo: string, slug: string): ArchiveItem | undefined {
  const normalized = normalizeArchiveType(tipo);
  return getArchiveItems().find((item) => normalizeArchiveType(item.tipo) === normalized && item.slug === slug);
}

export function getRelatedArchiveItems(entry: ArchiveItem, limit = 6): ArchiveItem[] {
  const tags = String(entry.tags || '')
    .split(/\|\||;|,/g)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  return getArchiveItems()
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
