import crypto from 'node:crypto';

export function textValue(value: unknown, fallback = '') {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
}

export function numberValue(value: unknown, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function boolValue(value: unknown) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function roundTo(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function slugify(value: unknown) {
  return textValue(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeIdentity(value: unknown) {
  return textValue(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function normalizeTrack(value: unknown) {
  return slugify(value)
    .replace(/^(fn|ks|rt|mx|acu|nrms)_/, '')
    .replace(/_?(circuit|circuito|track|spain|italy|italia)$/g, '');
}

export function formatLapMs(value: unknown) {
  const ms = numberValue(value, 0);
  if (!ms || ms <= 0) return '--';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function ratingClassFromSr(score: number) {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'E';
}

export function ratingClassFromGsr(score: number) {
  if (score >= 1750) return 'S';
  if (score >= 1650) return 'A';
  if (score >= 1550) return 'B';
  if (score >= 1475) return 'C';
  if (score >= 1400) return 'D';
  return 'Rookie';
}

export function visibleGsr(mu: number) {
  return Math.round(1500 + (mu - 25) * 32);
}

export function isoNow() {
  return new Date().toISOString();
}

export function parseDateMs(value: unknown) {
  const text = textValue(value);
  if (!text) return 0;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : 0;
}

export function sessionTimeMs(value: unknown) {
  const numeric = numberValue(value, NaN);
  if (Number.isFinite(numeric) && numeric > 1000000000) return numeric * 1000;
  return parseDateMs(value);
}

export function uniqueId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function driverKeyFromParts(input: {
  strackerPlayerId?: number | null;
  steamGuid?: string | null;
  name?: string | null;
}) {
  const playerId = numberValue(input.strackerPlayerId, 0);
  if (playerId > 0) return `player:${playerId}`;
  const guid = textValue(input.steamGuid);
  if (guid) return `steam:${guid}`;
  return `name:${slugify(input.name || 'unknown') || 'unknown'}`;
}

export function ensureArray<T>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : [];
}

