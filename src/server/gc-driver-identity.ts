export type CanonicalDriverIdentityInput = {
  steamGuid?: unknown;
  sourceKey?: unknown;
  playerId?: unknown;
  rawPlayerId?: unknown;
  name?: unknown;
};

function clean(value: unknown) {
  return String(value ?? '').trim();
}

export function normalizeSteamGuid(value: unknown) {
  return clean(value).toLowerCase().replace(/^(?:steam|guid):/i, '');
}

export function normalizeDriverSourceKey(value: unknown) {
  return clean(value).toLowerCase() || 'main';
}

export function normalizeDriverName(value: unknown) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function canonicalDriverIdentityKey(input: CanonicalDriverIdentityInput) {
  const guid = normalizeSteamGuid(input.steamGuid);
  if (guid) return `steam:${guid}`;

  const sourceKey = normalizeDriverSourceKey(input.sourceKey);
  const playerId = clean(input.rawPlayerId ?? input.playerId);
  if (playerId) return `source:${sourceKey}:player:${playerId}`;

  return `source:${sourceKey}:name:${normalizeDriverName(input.name) || 'unknown'}`;
}

export function sameCanonicalDriver(
  left: CanonicalDriverIdentityInput,
  right: CanonicalDriverIdentityInput,
) {
  const leftGuid = normalizeSteamGuid(left.steamGuid);
  const rightGuid = normalizeSteamGuid(right.steamGuid);
  if (leftGuid && rightGuid) return leftGuid === rightGuid;
  return canonicalDriverIdentityKey(left) === canonicalDriverIdentityKey(right);
}
