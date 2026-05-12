export type ArchiveRelation = {
  id: string;
  targetId: string;
  targetSlug?: string;
  targetCategory?: string;
  targetTitle?: string;
  label: string;
  reason: string;
  score: number;
  source: 'auto' | 'manual';
  pinned?: boolean;
  hidden?: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  circuits: 'Circuito',
  circuitos: 'Circuito',
  drivers: 'Piloto',
  pilotos: 'Piloto',
  vehicles: 'Vehículo',
  vehiculos: 'Vehículo',
  championships: 'Campeonato',
  campeonatos: 'Campeonato',
  records: 'Récord',
  glosario: 'Glosario',
  glossary: 'Glosario'
};

function text(value: unknown) {
  return String(value ?? '').trim();
}

function normalize(value: unknown) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getField(item: any, keys: string[]) {
  const facts = item?.facts || item?.fields || item?.data || {};
  for (const key of keys) {
    const direct = text(item?.[key]);
    if (direct) return direct;
    const fact = text(facts?.[key]);
    if (fact) return fact;
  }
  return '';
}

function categoryOf(item: any) {
  return text(item?.category || item?.type || item?.kind || '');
}

function titleOf(item: any) {
  return text(item?.title || item?.nombre || item?.name || item?.slug || item?.id);
}

export function getRelationLabel(item: any) {
  const category = categoryOf(item);
  return CATEGORY_LABELS[category] || category || 'Ficha';
}

export function getBestArchiveRelations(item: any, allItems: any[], limit = 8): ArchiveRelation[] {
  const currentId = text(item?.id);
  const hidden = new Set((item?.relationsHidden || item?.hiddenRelations || []).map((v: unknown) => text(v)));
  const manual = Array.isArray(item?.relationsManual) ? item.relationsManual : Array.isArray(item?.manualRelations) ? item.manualRelations : [];
  const auto = Array.isArray(item?.relationsAuto) ? item.relationsAuto : Array.isArray(item?.autoRelations) ? item.autoRelations : [];

  const manualRelations = manual
    .map((rel: any) => ({ ...rel, source: 'manual', score: Number(rel?.score || 999), pinned: rel?.pinned !== false }))
    .filter((rel: any) => rel?.targetId && !hidden.has(text(rel.targetId)));

  const autoRelations = auto
    .map((rel: any) => ({ ...rel, source: 'auto', score: Number(rel?.score || 0) }))
    .filter((rel: any) => rel?.targetId && !hidden.has(text(rel.targetId)));

  const hydrated = [...manualRelations, ...autoRelations].map((rel: any) => {
    const target = allItems.find((candidate) => text(candidate?.id) === text(rel.targetId));
    return {
      id: text(rel.id || `${currentId}-${rel.targetId}`),
      targetId: text(rel.targetId),
      targetSlug: text(rel.targetSlug || target?.slug),
      targetCategory: text(rel.targetCategory || categoryOf(target)),
      targetTitle: text(rel.targetTitle || titleOf(target)),
      label: text(rel.label || getRelationLabel(target)),
      reason: text(rel.reason || 'Relacionado'),
      score: Number(rel.score || 0),
      source: rel.source === 'manual' ? 'manual' : 'auto',
      pinned: Boolean(rel.pinned),
      hidden: Boolean(rel.hidden)
    } as ArchiveRelation;
  });

  const seen = new Set<string>();
  return hydrated
    .filter((rel) => {
      if (!rel.targetId || rel.targetId === currentId || seen.has(rel.targetId)) return false;
      seen.add(rel.targetId);
      return true;
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.score - a.score || a.targetTitle.localeCompare(b.targetTitle))
    .slice(0, limit);
}

export function buildAutoRelationsForItem(item: any, allItems: any[], limit = 12): ArchiveRelation[] {
  const currentId = text(item?.id);
  const currentCategory = normalize(categoryOf(item));
  const title = normalize(titleOf(item));
  const country = normalize(getField(item, ['pais', 'country']));
  const city = normalize(getField(item, ['ciudad', 'poblacion', 'city']));
  const championship = normalize(getField(item, ['campeonato_principal', 'campeonato', 'championship']));
  const driver = normalize(getField(item, ['piloto', 'driver']));
  const vehicle = normalize(getField(item, ['vehiculo', 'vehicle', 'coche']));
  const circuit = normalize(getField(item, ['circuito', 'circuito_slug', 'circuito_nombre', 'track']));

  const candidates: ArchiveRelation[] = [];

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
    const reasons: string[] = [];

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

    candidates.push({
      id: `${currentId}-${targetId}`,
      targetId,
      targetSlug: text(target?.slug),
      targetCategory: text(categoryOf(target)),
      targetTitle: titleOf(target),
      label: getRelationLabel(target),
      reason: [...new Set(reasons)].slice(0, 2).join(' · '),
      score,
      source: 'auto'
    });
  }

  return candidates.sort((a, b) => b.score - a.score || a.targetTitle.localeCompare(b.targetTitle)).slice(0, limit);
}
