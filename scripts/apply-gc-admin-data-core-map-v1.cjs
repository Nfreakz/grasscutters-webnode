#!/usr/bin/env node
/* GC_ADMIN_DATA_CORE_MAP_V1_APPLY
 * Documentation-only pack.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const files = [
  ['docs/GC_ADMIN_DATA_CORE_MAP_V1.md', 'docs/GC_ADMIN_DATA_CORE_MAP_V1.md'],
  ['README_GC_ADMIN_DATA_CORE_MAP_V1.md', 'README_GC_ADMIN_DATA_CORE_MAP_V1.md']
];

for (const [fromRel, toRel] of files) {
  const from = path.join(root, fromRel);
  const to = path.join(root, toRel);
  if (!fs.existsSync(from)) {
    console.error(`[GC ADMIN MAP] Missing ${fromRel}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log(`[GC ADMIN MAP] Ready: ${toRel}`);
}

console.log('[GC ADMIN MAP] Documentation-only pack applied.');
