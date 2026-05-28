#!/usr/bin/env node
/* GC_COMBOS_TOTALCOMBOS_WARNING_FIX_V1_3_APPLY
 * Fixes Endpoint Lab warning: combos-core -> "totalCombos vacío".
 * Adds totalCombos/publicCombos fields to /api/gc/combos response without changing combo logic.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server', 'index.ts');

if (!fs.existsSync(serverPath)) {
  console.error('[GC COMBOS TOTALCOMBOS FIX] Missing src/server/index.ts');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

if (!source.includes('GC_COMBO_CANONICAL_PUBLIC_FILTER_V1_START')) {
  console.error('[GC COMBOS TOTALCOMBOS FIX] Canonical combo filter block not found.');
  process.exit(1);
}

if (!source.includes('function gcComboCanonicalIsPublicItemV1')) {
  console.error('[GC COMBOS TOTALCOMBOS FIX] Public item helper not found. Apply min drivers pack first.');
  process.exit(1);
}

let patched = 0;

// Patch /api/gc/combos response. We want totalCombos beside totalMatched.
const target = "totalMatched: items.filter(gcComboCanonicalIsPublicItemV1).length,\n      items: publicItems,";
const replacement = "totalMatched: items.filter(gcComboCanonicalIsPublicItemV1).length,\n      totalCombos: items.filter(gcComboCanonicalIsPublicItemV1).length,\n      publicCombos: items.filter(gcComboCanonicalIsPublicItemV1).length,\n      rawCombos: items.length,\n      items: publicItems,";

if (source.includes(target)) {
  source = source.replace(target, replacement);
  patched += 1;
} else if (!source.includes('publicCombos: items.filter(gcComboCanonicalIsPublicItemV1).length')) {
  const fallback = "count: publicItems.length,\n      totalMatched:";
  if (!source.includes(fallback)) {
    console.error('[GC COMBOS TOTALCOMBOS FIX] Could not find /api/gc/combos response anchor.');
    process.exit(1);
  }

  source = source.replace(
    fallback,
    "count: publicItems.length,\n      totalCombos: items.filter(gcComboCanonicalIsPublicItemV1).length,\n      publicCombos: items.filter(gcComboCanonicalIsPublicItemV1).length,\n      rawCombos: items.length,\n      totalMatched:"
  );
  patched += 1;
} else {
  console.log('[GC COMBOS TOTALCOMBOS FIX] totalCombos/publicCombos already present.');
}

// Also patch legacy stats if somehow totalCombos was missed, but avoid duplicate.
source = source.replace(
  /totalCombos:\s*items\.filter\(gcComboCanonicalIsPublicItemV1\)\.length,\s*\n\s*totalCombos:\s*items\.filter\(gcComboCanonicalIsPublicItemV1\)\.length,/g,
  "totalCombos: items.filter(gcComboCanonicalIsPublicItemV1).length,"
);

fs.writeFileSync(serverPath, source, 'utf8');

console.log(`[GC COMBOS TOTALCOMBOS FIX] Done. Patched: ${patched}.`);
console.log('[GC COMBOS TOTALCOMBOS FIX] /api/gc/combos should now expose totalCombos.');
console.log('[GC COMBOS TOTALCOMBOS FIX] Run: npm run build');
