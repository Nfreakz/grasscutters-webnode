import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const relativePath = 'src/components/AdminSubnav.astro';
const filePath = path.join(root, relativePath);
const marker = 'GC_PHASE4B_ADMIN_SUBNAV_BUILD_HOTFIX_V1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, '_gc_backups', `phase4b-admin-subnav-hotfix-${stamp}`);

if (!fs.existsSync(filePath)) {
  throw new Error(`No existe ${relativePath}`);
}

const original = fs.readFileSync(filePath, 'utf8');

if (original.includes(marker)) {
  console.log(`[GC Phase 4B hotfix] ${relativePath} ya estaba corregido.`);
  process.exit(0);
}

let next = original;

const brokenVariants = [
  `{ href: '/admin/integridad-ratings', label: 'Integridad ratings', desc: 'Duplicados y rebuild' }, <!-- GC_PHASE4B_RATINGS_CANONICAL_REBUILD_V1 -->`,
  `{ href: "/admin/integridad-ratings", label: "Integridad ratings", desc: "Duplicados y rebuild" }, <!-- GC_PHASE4B_RATINGS_CANONICAL_REBUILD_V1 -->`,
];

let replaced = false;
for (const broken of brokenVariants) {
  if (!next.includes(broken)) continue;
  next = next.replace(
    broken,
    `/* ${marker} */\n      { href: '/admin/integridad-ratings', label: 'Integridad ratings', desc: 'Duplicados y rebuild' },`
  );
  replaced = true;
  break;
}

if (!replaced) {
  const regex = /(\{\s*href:\s*['"]\/admin\/integridad-ratings['"][^}\n]*\},)\s*<!--\s*GC_PHASE4B_RATINGS_CANONICAL_REBUILD_V1\s*-->/;
  if (regex.test(next)) {
    next = next.replace(regex, `/* ${marker} */\n      $1`);
    replaced = true;
  }
}

if (!replaced) {
  const itemAnchor = `{ href: '/admin/integridad-ratings', label: 'Integridad ratings', desc: 'Duplicados y rebuild' },`;
  if (next.includes(itemAnchor)) {
    next = next.replace(itemAnchor, `/* ${marker} */\n      ${itemAnchor}`);
    replaced = true;
  }
}

if (!replaced) {
  throw new Error('No se encontró la entrada de Integridad ratings en AdminSubnav.astro.');
}

if (/<!--\s*GC_PHASE4B_RATINGS_CANONICAL_REBUILD_V1\s*-->/.test(next)) {
  throw new Error('Sigue existiendo el comentario HTML inválido dentro del frontmatter.');
}

const destination = path.join(backupDir, relativePath);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(filePath, destination);
fs.writeFileSync(filePath, next, 'utf8');

console.log('[GC Phase 4B hotfix] Comentario inválido de AdminSubnav corregido.');
console.log(`[GC Phase 4B hotfix] Backup: ${path.relative(root, backupDir)}`);
console.log(`[GC Phase 4B hotfix] Modificado: ${relativePath}`);
console.log('[GC Phase 4B hotfix] Siguiente: npm run deps:baseline && npm run quality');
