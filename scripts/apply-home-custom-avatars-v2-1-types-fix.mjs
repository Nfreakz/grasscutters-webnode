import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.env.GC_PROJECT_ROOT || 'G:\\Web Node\\grasscutters-webnode');
const file = path.join(projectRoot, 'src', 'pages', 'index.astro');
const backupDir = path.join(projectRoot, '_gc_backups', `home-custom-avatars-v2-1-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const backupFile = path.join(backupDir, 'src', 'pages', 'index.astro');

function fail(message) {
  console.error(`[GC HOME AVATARS V2.1] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) fail(`No existe ${file}`);

let source = fs.readFileSync(file, 'utf8');

if (!source.includes('GC_HOME_CUSTOM_AVATAR_DIRECTORY_V2')) {
  fail('No se encontró el bloque V2 de avatares.');
}

fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.copyFileSync(file, backupFile);

const replacements = [
  ["const normalizeName = (value) =>", "const normalizeName = (value: unknown): string =>"],
  ["const cleanAvatar = (value) =>", "const cleanAvatar = (value: unknown): string =>"],
  ["const byName = new Map();", "const byName = new Map<string, string>();"],
  ["const byId = new Map();", "const byId = new Map<string, string>();"],
  ["let loading = null;", "let loading: Promise<void> | null = null;"],
  ["const rowName = (row) =>", "const rowName = (row: any): string =>"],
  ["const rowId = (row) =>", "const rowId = (row: any): unknown =>"],
  ["const rowAvatar = (row) =>", "const rowAvatar = (row: any): string =>"],
  ["const register = (row) =>", "const register = (row: any): void =>"],
  ["const extractRows = (payload) =>", "const extractRows = (payload: any): any[] =>"],
  ["const textFrom = (selector, scope = document) =>", "const textFrom = (selector: string, scope: ParentNode | null = document): string =>"],
  ["const profileIdFromLink = (scope) =>", "const profileIdFromLink = (scope: ParentNode | null): string =>"],
  ["const avatarContext = (img) =>", "const avatarContext = (img: HTMLImageElement): { name: string; id: string } =>"],
  ["const resolveAvatar = ({ name, id }) =>", "const resolveAvatar = ({ name, id }: { name: string; id: string }): string =>"],
  ["const applyAvatar = (img) =>", "const applyAvatar = (img: HTMLImageElement): void =>"],
  ["document.querySelectorAll([", "document.querySelectorAll<HTMLImageElement>(["]
];

for (const [from, to] of replacements) {
  if (!source.includes(from)) {
    fail(`No se encontró el fragmento esperado: ${from}`);
  }
  source = source.replace(from, to);
}

source = source.replace(
  "loading = (async () => {",
  "loading = (async (): Promise<void> => {"
);

source = source.replace(
  "}).catch((error) => {",
  "}).catch((error: unknown) => {"
);

fs.writeFileSync(file, source, 'utf8');

console.log('[GC HOME AVATARS V2.1] Tipos aplicados correctamente.');
console.log(`  - Backup: ${backupFile}`);
