export function normalizeName(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function lapTimeToText(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '-';

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);

  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
