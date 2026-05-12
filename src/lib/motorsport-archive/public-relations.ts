export type ArchivePublicRelation = {
  id: string;
  targetId: string;
  title: string;
  slug: string;
  category: string;
  label: string;
  reason: string;
  score: number;
  url: string;
  imageUrl?: string | null;
};

const CATEGORY_SLUGS: Record<string, string> = {
  circuit: 'circuitos',
  circuits: 'circuitos',
  circuito: 'circuitos',
  driver: 'pilotos',
  drivers: 'pilotos',
  piloto: 'pilotos',
  vehicle: 'vehiculos',
  vehicles: 'vehiculos',
  vehiculo: 'vehiculos',
  championship: 'campeonatos',
  championships: 'campeonatos',
  campeonato: 'campeonatos',
  record: 'records',
  records: 'records',
  glossary: 'glosario',
  glosario: 'glosario'
};

function text(value: unknown) {
  return String(value ?? '').trim();
}

function categorySlug(category: string) {
  return CATEGORY_SLUGS[text(category).toLowerCase()] || text(category).toLowerCase() || 'archivo';
}

function itemUrl(item: any) {
  return `/archivo/${categorySlug(item.category || item.type)}/${item.slug}/`;
}

function mainImage(item: any) {
  const media = Array.isArray(item.media) ? item.media : [];
  const cover = media.find((entry: any) => entry?.isMain || entry?.main || entry?.cover) || media[0];
  return cover?.url || cover?.localUrl || cover?.local_url || item.imageUrl || item.coverUrl || null;
}

function normalizedCategory(item: any) {
  return text(item.category || item.type || 'archivo').toLowerCase();
}

function factValue(item: any, keys: string[]) {
  const facts = item.facts || item.data || {};
  for (const key of keys) {
    const value = facts[key] ?? facts[key.toLowerCase()] ?? item[key];
    if (text(value)) return text(value);
  }
  return '';
}

function manualRelationsFor(item: any, itemsById: Map<string, any>) {
  const relations = Array.isArray(item.relations) ? item.relations : [];
  return relations
    .filter((relation: any) => !relation.hidden && relation.targetId)
    .map((relation: any) => {
      const target = itemsById.get(String(relation.targetId));
      if (!target || target.status !== 'published') return null;
      return {
        id: `manual:${item.id}:${target.id}`,
        targetId: String(target.id),
        title: text(target.title || target.name),
        slug: text(target.slug),
        category: normalizedCategory(target),
        label: relation.pinned ? 'Fijado' : 'Relacionado',
        reason: text(relation.label || relation.reason || 'Relación seleccionada en admin'),
        score: relation.pinned ? 1000 : 800,
        url: itemUrl(target),
        imageUrl: mainImage(target)
      };
    })
    .filter(Boolean) as ArchivePublicRelation[];
}

function automaticRelationsFor(item: any, allItems: any[]) {
  const category = normalizedCategory(item);
  const country = factValue(item, ['pais', 'country']);
  const city = factValue(item, ['ciudad', 'city', 'poblacion']);
  const championship = factValue(item, ['campeonato_principal', 'campeonato', 'championship']);
  const driver = factValue(item, ['piloto', 'driver']);
  const vehicle = factValue(item, ['vehiculo', 'vehicle', 'coche']);
  const circuit = factValue(item, ['circuito', 'circuit', 'track']);

  return allItems
    .filter((target) => target.id !== item.id && target.status === 'published')
    .map((target) => {
      let score = 0;
      const reasons: string[] = [];
      const targetCategory = normalizedCategory(target);
      const targetCountry = factValue(target, ['pais', 'country']);
      const targetCity = factValue(target, ['ciudad', 'city', 'poblacion']);
      const targetChampionship = factValue(target, ['campeonato_principal', 'campeonato', 'championship']);
      const targetDriver = factValue(target, ['piloto', 'driver']);
      const targetVehicle = factValue(target, ['vehiculo', 'vehicle', 'coche']);
      const targetCircuit = factValue(target, ['circuito', 'circuit', 'track']);

      if (championship && targetChampionship && championship.toLowerCase() === targetChampionship.toLowerCase()) {
        score += 90;
        reasons.push(`Mismo campeonato: ${championship}`);
      }
      if (circuit && targetCircuit && circuit.toLowerCase() === targetCircuit.toLowerCase()) {
        score += 120;
        reasons.push(`Mismo circuito: ${circuit}`);
      }
      if (driver && targetDriver && driver.toLowerCase() === targetDriver.toLowerCase()) {
        score += 100;
        reasons.push(`Mismo piloto: ${driver}`);
      }
      if (vehicle && targetVehicle && vehicle.toLowerCase() === targetVehicle.toLowerCase()) {
        score += 100;
        reasons.push(`Mismo vehículo: ${vehicle}`);
      }
      if (country && targetCountry && country.toLowerCase() === targetCountry.toLowerCase()) {
        score += 40;
        reasons.push(`Mismo país: ${country}`);
      }
      if (city && targetCity && city.toLowerCase() === targetCity.toLowerCase()) {
        score += 60;
        reasons.push(`Misma zona: ${city}`);
      }
      if (category && targetCategory && category === targetCategory) {
        score += 20;
        reasons.push('Misma categoría');
      }

      if (score <= 0) return null;
      return {
        id: `auto:${item.id}:${target.id}`,
        targetId: String(target.id),
        title: text(target.title || target.name),
        slug: text(target.slug),
        category: targetCategory,
        label: score >= 100 ? 'Relación directa' : 'También puede interesarte',
        reason: reasons.slice(0, 2).join(' · '),
        score,
        url: itemUrl(target),
        imageUrl: mainImage(target)
      };
    })
    .filter(Boolean) as ArchivePublicRelation[];
}

export function getArchivePublicRelations(item: any, allItems: any[], limit = 8) {
  const itemsById = new Map(allItems.map((entry) => [String(entry.id), entry]));
  const manual = manualRelationsFor(item, itemsById);
  const manualTargets = new Set(manual.map((relation) => relation.targetId));
  const automatic = automaticRelationsFor(item, allItems).filter((relation) => !manualTargets.has(relation.targetId));
  return [...manual, ...automatic]
    .filter((relation) => relation.title && relation.url)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}
