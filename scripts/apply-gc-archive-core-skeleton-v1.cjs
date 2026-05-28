#!/usr/bin/env node
/* GC_ARCHIVE_CORE_SKELETON_V1_APPLY
 * Adds safe public Archive Core endpoints.
 * This is intentionally separated from Race Data Core and Championship Core.
 * It can optionally read from GC_ARCHIVE_CORE_SOURCE_URL if configured.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

const START = '/* GC_ARCHIVE_CORE_SKELETON_V1_START */';
const END = '/* GC_ARCHIVE_CORE_SKELETON_V1_END */';

if (!fs.existsSync(serverPath)) {
  console.error('[GC ARCHIVE CORE] Missing src/server/index.ts');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

if (!source.includes('getQueryNumber') || !source.includes('getQueryString')) {
  console.error('[GC ARCHIVE CORE] Missing query helpers. Apply after server core exists.');
  process.exit(1);
}

const routeBlock = `
${START}
type GcArchiveCoreItemV1 = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  type: string;
  status: string;
  imageUrl: string;
  url: string;
  publishedAt: string | null;
  updatedAt: string | null;
  source: string;
  tags: string[];
};

function gcArchiveCoreTextV1(value: unknown, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function gcArchiveCoreDateV1(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function gcArchiveCoreArrayV1(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => gcArchiveCoreTextV1(item)).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,;|]/g).map((item) => item.trim()).filter(Boolean);
  return [];
}

function gcArchiveCoreSlugV1(value: unknown, fallback = 'item') {
  const raw = gcArchiveCoreTextV1(value, fallback);
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function gcArchiveCoreNormalizeItemV1(item: any, index = 0): GcArchiveCoreItemV1 {
  const id = gcArchiveCoreTextV1(item?.id ?? item?._id ?? item?.uuid ?? item?.slug, String(index + 1));
  const title = gcArchiveCoreTextV1(item?.title ?? item?.name ?? item?.heading, 'Ficha sin título');
  const slug = gcArchiveCoreTextV1(item?.slug, gcArchiveCoreSlugV1(title, id));
  const category = gcArchiveCoreTextV1(item?.category ?? item?.section ?? item?.group, 'general');
  const type = gcArchiveCoreTextV1(item?.type ?? item?.kind, category);
  const status = gcArchiveCoreTextV1(item?.status, 'published').toLowerCase();
  const imageUrl = gcArchiveCoreTextV1(
    item?.imageUrl ?? item?.coverUrl ?? item?.featuredImage ?? item?.image ?? item?.thumbnail ?? item?.media?.[0]?.url
  );

  return {
    id,
    slug,
    title,
    summary: gcArchiveCoreTextV1(item?.summary ?? item?.excerpt ?? item?.description),
    category,
    type,
    status,
    imageUrl,
    url: gcArchiveCoreTextV1(item?.url ?? item?.href, slug ? '/archivo/' + encodeURIComponent(slug) : ''),
    publishedAt: gcArchiveCoreDateV1(item?.publishedAt ?? item?.createdAt ?? item?.date),
    updatedAt: gcArchiveCoreDateV1(item?.updatedAt ?? item?.modifiedAt),
    source: gcArchiveCoreTextV1(item?.source, 'archive-core'),
    tags: gcArchiveCoreArrayV1(item?.tags ?? item?.labels)
  };
}

function gcArchiveCorePublicOnlyV1(items: GcArchiveCoreItemV1[]) {
  return items.filter((item) => !['draft', 'hidden', 'private', 'deleted'].includes(String(item.status || '').toLowerCase()));
}

async function gcArchiveCoreReadFromConfiguredSourceV1() {
  const sourceUrl = process.env.GC_ARCHIVE_CORE_SOURCE_URL?.trim();
  if (!sourceUrl) {
    return {
      ok: true,
      source: 'not-configured',
      items: [] as GcArchiveCoreItemV1[],
      warnings: ['GC_ARCHIVE_CORE_SOURCE_URL not configured. Archive Core skeleton is active but has no public source yet.']
    };
  }

  const response = await fetch(sourceUrl, {
    headers: {
      accept: 'application/json',
      'user-agent': 'GrassCutters Archive Core v1'
    },
    cache: 'no-store'
  });

  const data: any = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error('Archive Core source returned HTTP ' + response.status);
  }

  const rawItems = Array.isArray(data) ? data : (data.items || data.data?.items || data.results || []);
  const items = gcArchiveCorePublicOnlyV1(rawItems.map((item: any, index: number) => gcArchiveCoreNormalizeItemV1(item, index)));

  return {
    ok: true,
    source: 'configured-url',
    sourceUrl,
    items,
    warnings: [] as string[]
  };
}

function gcArchiveCoreSummaryV1(items: GcArchiveCoreItemV1[]) {
  const published = gcArchiveCorePublicOnlyV1(items);
  const byCategory = published.reduce((acc: Record<string, number>, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + 1;
    return acc;
  }, {});

  const featured = published.filter((item) =>
    item.tags.some((tag) => ['featured', 'destacado', 'home'].includes(tag.toLowerCase()))
  );

  return {
    total: items.length,
    public: published.length,
    featured: featured.length,
    byCategory,
    latest: [...published]
      .sort((a, b) => Date.parse(b.publishedAt || b.updatedAt || '1970-01-01') - Date.parse(a.publishedAt || a.updatedAt || '1970-01-01'))
      .slice(0, 6),
    featuredItems: featured.slice(0, 6)
  };
}

app.get('/api/gc/archive/snapshot', async (_req, res) => {
  try {
    const archive = await gcArchiveCoreReadFromConfiguredSourceV1();
    const summary = gcArchiveCoreSummaryV1(archive.items);

    res.json({
      ok: true,
      source: 'gc-archive-core',
      generatedAt: new Date().toISOString(),
      domain: 'archive',
      upstream: archive.source,
      separatedFromRaceDataCore: true,
      separatedFromChampionshipCore: true,
      summary,
      warnings: archive.warnings,
      endpoints: {
        snapshot: '/api/gc/archive/snapshot',
        latest: '/api/gc/archive/latest'
      },
      message: 'Archive Core separado de Race Data Core y Championship Core.'
    });
  } catch (error) {
    console.error('[GC Archive Core] snapshot error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-archive-core',
      generatedAt: new Date().toISOString(),
      domain: 'archive',
      summary: { total: 0, public: 0, featured: 0, byCategory: {}, latest: [], featuredItems: [] },
      warnings: ['archive source failed'],
      message: 'No se pudo generar Archive Core snapshot.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});

app.get('/api/gc/archive/latest', async (req, res) => {
  try {
    const limit = getQueryNumber(req, 'limit', 6, 1, 24);
    const category = getQueryString(req, 'category', 'all').toLowerCase();
    const q = getQueryString(req, 'q') || getQueryString(req, 'search');

    const archive = await gcArchiveCoreReadFromConfiguredSourceV1();
    let items = gcArchiveCorePublicOnlyV1(archive.items);

    if (category !== 'all') items = items.filter((item) => item.category.toLowerCase() === category || item.type.toLowerCase() === category);
    if (q) {
      items = items.filter((item) => includesFilter([
        item.title,
        item.summary,
        item.category,
        item.type,
        item.tags.join(' ')
      ].join(' '), q));
    }

    items = items.sort((a, b) =>
      Date.parse(b.publishedAt || b.updatedAt || '1970-01-01') - Date.parse(a.publishedAt || a.updatedAt || '1970-01-01')
    );

    res.json({
      ok: true,
      source: 'gc-archive-core',
      generatedAt: new Date().toISOString(),
      domain: 'archive',
      upstream: archive.source,
      filters: { category, q: q || null },
      count: Math.min(items.length, limit),
      totalMatched: items.length,
      items: items.slice(0, limit),
      warnings: archive.warnings,
      message: 'Últimos elementos públicos de Archive Core.'
    });
  } catch (error) {
    console.error('[GC Archive Core] latest error:', error);
    res.status(200).json({
      ok: false,
      source: 'gc-archive-core',
      generatedAt: new Date().toISOString(),
      domain: 'archive',
      items: [],
      warnings: ['archive source failed'],
      message: 'No se pudieron leer elementos Archive Core.',
      error: process.env.GC_DEBUG_API === 'true' && error instanceof Error ? error.message : undefined
    });
  }
});
${END}
`;

function replaceMarkedBlock(text, start, end, block) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return text.slice(0, startIndex) + block.trimEnd() + '\n' + text.slice(endIndex + end.length);
  }

  return null;
}

function insertBefore(text, anchor, block, label) {
  const index = text.indexOf(anchor);
  if (index === -1) {
    console.error(`[GC ARCHIVE CORE] Missing anchor for ${label}: ${anchor}`);
    process.exit(1);
  }

  return text.slice(0, index) + block + '\n\n' + text.slice(index);
}

const replaced = replaceMarkedBlock(source, START, END, routeBlock);
if (replaced !== null) {
  source = replaced;
} else {
  const anchor =
    source.includes("app.get('/api/gc/championship/snapshot'")
      ? "app.get('/api/gc/championship/snapshot'"
      : source.includes("app.get('/api/gc/diagnostics'")
        ? "app.get('/api/gc/diagnostics'"
        : source.includes("app.get('/api/gc/snapshot'")
          ? "app.get('/api/gc/snapshot'"
          : "app.get('/api/health'";
  source = insertBefore(source, anchor, routeBlock, 'Archive Core routes');
}

fs.writeFileSync(serverPath, source, 'utf8');
console.log('[GC ARCHIVE CORE] Added/updated /api/gc/archive/* endpoints.');
console.log('[GC ARCHIVE CORE] Run: npm run build');
