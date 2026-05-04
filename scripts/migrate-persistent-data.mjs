import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');
const appDataDir = process.env.APP_DATA_DIR?.trim();
const force = process.argv.includes('--force');

if (!appDataDir) {
  console.error('Falta APP_DATA_DIR en .env. Ejemplo: APP_DATA_DIR=/home/TU_USUARIO/gc-persistent');
  process.exit(1);
}

const targetRoot = path.isAbsolute(appDataDir) ? appDataDir : path.join(rootDir, appDataDir);

const pairs = [
  ['data/app/users.json', 'app/users.json'],
  ['data/app/display-names.json', 'app/display-names.json'],
  ['data/stracker/stracker.db3', 'stracker/stracker.db3']
];

for (const [fromRel, toRel] of pairs) {
  const from = path.join(rootDir, fromRel);
  const to = path.join(targetRoot, toRel);

  if (!fs.existsSync(from)) {
    console.log(`SKIP ${fromRel}: no existe`);
    continue;
  }

  if (fs.existsSync(to) && !force) {
    console.log(`SKIP ${toRel}: ya existe en destino. Usa --force para sobrescribir.`);
    continue;
  }

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log(`OK ${fromRel} -> ${to}`);
}
