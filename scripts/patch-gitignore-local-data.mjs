#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, '.gitignore');
const block = `
# GC local persistent/generated data
data/app/*.json
data/app/*.sqlite
data/app/*.sqlite-*
data/app/*.db
data/app/*.db3
gc-local-persistent/
prepush-report.json
*.backup-*
*.backup-*
*.tmp
`;

let current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const backup = fs.existsSync(file) ? `${file}.backup-gc-prepush-${new Date().toISOString().replace(/[:.]/g, '-')}` : null;
if (backup) fs.copyFileSync(file, backup);

const lines = block.trim().split(/\r?\n/);
let changed = false;
for (const line of lines) {
  if (!current.includes(line)) {
    current += `${current.endsWith('\n') || current.length === 0 ? '' : '\n'}${line}\n`;
    changed = true;
  }
}

if (changed) {
  fs.writeFileSync(file, current, 'utf8');
  console.log('[GC Pre-push] .gitignore actualizado.');
  if (backup) console.log(`[GC Pre-push] Backup: ${backup}`);
} else {
  console.log('[GC Pre-push] .gitignore ya contenía las reglas recomendadas.');
}
