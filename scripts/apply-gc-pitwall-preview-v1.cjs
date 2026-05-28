#!/usr/bin/env node
/* GC_PITWALL_PREVIEW_V1_APPLY
 * Applies the hidden /pitwall preview route.
 * Safe copy from payload files. Does not touch /, index.astro, assets or navigation.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

const files = [
  {
    from: path.join(root, 'payload', 'src', 'pages', 'pitwall.astro'),
    to: path.join(root, 'src', 'pages', 'pitwall.astro'),
    marker: 'GC_PITWALL_PREVIEW_V1'
  },
  {
    from: path.join(root, 'payload', 'src', 'styles', 'pages', 'pitwall.css'),
    to: path.join(root, 'src', 'styles', 'pages', 'pitwall.css'),
    marker: 'GC_PITWALL_PREVIEW_V1'
  },
  {
    from: path.join(root, 'docs', 'GC_PITWALL_PREVIEW_V1.md'),
    to: path.join(root, 'docs', 'GC_PITWALL_PREVIEW_V1.md'),
    marker: 'GC Pitwall Preview v1'
  }
];

function ensureDir(filePath){
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function read(filePath){
  return fs.readFileSync(filePath, 'utf8');
}

function write(filePath, content){
  ensureDir(filePath);
  fs.writeFileSync(filePath, content, 'utf8');
}

for (const item of files) {
  if (!fs.existsSync(item.from)) {
    console.error(`[GC PITWALL] Missing payload file: ${path.relative(root, item.from)}`);
    process.exit(1);
  }

  const next = read(item.from);

  if (fs.existsSync(item.to)) {
    const current = read(item.to);
    if (!current.includes(item.marker)) {
      console.error(`[GC PITWALL] Refusing to overwrite existing file without marker: ${path.relative(root, item.to)}`);
      console.error('[GC PITWALL] Rename or backup that file manually if you really want to replace it.');
      process.exit(1);
    }
  }

  write(item.to, next);
  console.log(`[GC PITWALL] Wrote ${path.relative(root, item.to)}`);
}

console.log('[GC PITWALL] Done. Run: npm run build');
