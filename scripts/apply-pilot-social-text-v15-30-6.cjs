const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pilotPagePath = path.join(root, 'src', 'pages', 'pilotos', '[id].astro');

if (!fs.existsSync(pilotPagePath)) {
  console.error('[GC PILOT SOCIAL TEXT] No encuentro ' + pilotPagePath);
  process.exit(1);
}

let content = fs.readFileSync(pilotPagePath, 'utf8');
const original = content;

if (content.includes('GC_PILOT_SOCIAL_TEXT_V15_30_6')) {
  console.log('[GC PILOT SOCIAL TEXT] v15.30.6 ya parece aplicado.');
  process.exit(0);
}

function replaceOrFail(from, to, label) {
  if (!content.includes(from)) {
    console.error('[GC PILOT SOCIAL TEXT] No encuentro bloque: ' + label);
    process.exit(1);
  }
  content = content.replace(from, to);
}

const oldBlock = `async function loadPilotSeo() {
  if (!isNumericPilotId) return defaultPilotSeo;

  try {
    const apiUrl = new URL(\`/api/pilots/\${encodeURIComponent(rawId)}/profile\`, Astro.url.origin);
    const response = await fetch(apiUrl, {
      headers: { accept: 'application/json' },
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) return defaultPilotSeo;

    const pilot = firstValue(data.pilot, data.driver) || {};
    const summary = data.summary || {};
    const best = firstValue(summary.bestLap, data.bestLap);
    const name = pilotDisplayName(pilot, data);

    const validLaps = numberText(firstValue(summary.validLaps, data.validLaps));
    const totalLaps = numberText(firstValue(summary.totalLaps, data.totalLaps));
    const cars = numberText(firstValue(summary.carsCount, data.carsCount));
    const tracks = numberText(firstValue(summary.tracksCount, data.tracksCount));
    const bestLap = lapText(firstValue(best?.lapTimeFormatted, best?.lapTime, best?.bestLapTimeFormatted, summary.bestLapTime));

    const parts = [
      totalLaps ? \`\${totalLaps} vueltas\` : '',
      validLaps ? \`\${validLaps} válidas\` : '',
      cars ? \`\${cars} coches\` : '',
      tracks ? \`\${tracks} circuitos\` : '',
      bestLap ? \`mejor vuelta \${bestLap}\` : '',
    ].filter(Boolean);

    return {
      title: \`\${name} | Piloto GrassCutters\`,
      description: parts.length
        ? \`\${name} en GrassCutters Racing: \${parts.join(', ')}.\`
        : \`Ficha pública de \${name} en GrassCutters Racing.\`,
      image: \`/api/pilot-social-image/\${encodeURIComponent(rawId)}.png\`,
      imageAlt: \`Avatar de \${name}\`,
    };
  } catch {
    return defaultPilotSeo;
  }
}`;

const newBlock = `/* GC_PILOT_SOCIAL_TEXT_V15_30_6 START */
function uniqueSeoUrls(urls) {
  const seen = new Set();
  return urls
    .filter(Boolean)
    .map((url) => String(url).trim())
    .filter((url) => {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

function safeOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    return url.origin;
  } catch {
    return '';
  }
}

function getSeoApiCandidates() {
  const endpoint = \`/api/pilots/\${encodeURIComponent(rawId)}/profile\`;
  const publicSite = import.meta.env.PUBLIC_SITE_URL || '';
  const localPort = import.meta.env.PORT || process.env.PORT || '3000';

  return uniqueSeoUrls([
    new URL(endpoint, Astro.url.origin).toString(),
    publicSite ? new URL(endpoint, publicSite).toString() : '',
    \`http://127.0.0.1:\${localPort}\${endpoint}\`,
    \`http://localhost:\${localPort}\${endpoint}\`,
  ]);
}

function nestedPilotSource(data) {
  return firstValue(
    data?.pilot,
    data?.driver,
    data?.profile?.pilot,
    data?.profile?.driver,
    data?.summary?.pilot,
    data?.summary?.driver,
    data?.data?.pilot,
    data?.data?.driver,
    data?.item?.pilot,
    data?.item?.driver
  ) || {};
}

function nestedSummarySource(data) {
  return firstValue(
    data?.summary,
    data?.profile?.summary,
    data?.data?.summary,
    data?.item?.summary
  ) || {};
}

function nestedBestLapSource(data, summary) {
  return firstValue(
    summary?.bestLap,
    data?.bestLap,
    data?.profile?.bestLap,
    data?.data?.bestLap,
    data?.item?.bestLap
  );
}

async function fetchPilotSeoData() {
  const candidates = getSeoApiCandidates();
  let lastError = '';

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
      });
      const data = await response.json().catch(() => null);

      if (response.ok && data?.ok) return data;
      lastError = \`\${response.status} \${response.statusText}\`;
    } catch (error) {
      lastError = error?.message || String(error);
    }
  }

  if (import.meta.env.DEV) {
    console.warn('[GC pilot SEO] No se pudo resolver perfil SEO', { rawId, lastError, candidates });
  }

  return null;
}

async function loadPilotSeo() {
  if (!isNumericPilotId) return defaultPilotSeo;

  const data = await fetchPilotSeoData();
  if (!data?.ok) return defaultPilotSeo;

  const pilot = nestedPilotSource(data);
  const summary = nestedSummarySource(data);
  const best = nestedBestLapSource(data, summary);
  const name = pilotDisplayName(pilot, data);

  const validLaps = numberText(firstValue(summary.validLaps, data.validLaps, data.profile?.validLaps, data.data?.validLaps));
  const totalLaps = numberText(firstValue(summary.totalLaps, data.totalLaps, data.profile?.totalLaps, data.data?.totalLaps));
  const cars = numberText(firstValue(summary.carsCount, data.carsCount, data.profile?.carsCount, data.data?.carsCount));
  const tracks = numberText(firstValue(summary.tracksCount, data.tracksCount, data.profile?.tracksCount, data.data?.tracksCount));
  const bestLap = lapText(firstValue(best?.lapTimeFormatted, best?.lapTime, best?.bestLapTimeFormatted, summary.bestLapTime, data.bestLapTime));

  const hasRealName = name && name !== \`Piloto #\${rawId}\`;
  const titleName = hasRealName ? name : \`Piloto #\${rawId}\`;

  const parts = [
    totalLaps ? \`\${totalLaps} vueltas\` : '',
    validLaps ? \`\${validLaps} válidas\` : '',
    cars ? \`\${cars} coches\` : '',
    tracks ? \`\${tracks} circuitos\` : '',
    bestLap ? \`mejor vuelta \${bestLap}\` : '',
  ].filter(Boolean);

  return {
    title: \`\${titleName} | Piloto GrassCutters\`,
    description: parts.length
      ? \`\${titleName} en GrassCutters Racing: \${parts.join(', ')}.\`
      : \`Ficha pública de \${titleName} en GrassCutters Racing.\`,
    image: \`/api/pilot-social-image/\${encodeURIComponent(rawId)}.png\`,
    imageAlt: \`Avatar de \${titleName}\`,
  };
}
/* GC_PILOT_SOCIAL_TEXT_V15_30_6 END */`;

replaceOrFail(oldBlock, newBlock, 'loadPilotSeo');

const backupPath = pilotPagePath + '.bak-v15-30-6';
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, original, 'utf8');
}

fs.writeFileSync(pilotPagePath, content, 'utf8');

console.log('[GC PILOT SOCIAL TEXT] loadPilotSeo reforzado.');
console.log('[GC PILOT SOCIAL TEXT] Backup: ' + backupPath);
console.log('[GC PILOT SOCIAL TEXT] Ejecuta ahora: npm run build');
