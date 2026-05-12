#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const serverFile = path.join(root, 'src', 'server', 'index.ts');
const editorFile = path.join(root, 'src', 'pages', 'admin', 'archivo', 'editar', '[id].astro');

if (!fs.existsSync(serverFile)) {
  console.error('[Archivo media v8.4.1] No existe src/server/index.ts');
  process.exit(1);
}

const backupServer = `${serverFile}.backup-media-center-v841-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(serverFile, backupServer);

let code = fs.readFileSync(serverFile, 'utf8');

/**
 * Asegura que Express sirva /archive-media desde ARCHIVE_MEDIA_DIR.
 * Si ya hay un montaje antiguo que apunta a public/archive-media, añadimos este antes.
 */
const staticBlock = `
/* GC Archivo Motorsport persistent archive-media static mount v8.4.1 */
{
  const gcArchiveMediaDir = process.env.ARCHIVE_MEDIA_DIR?.trim()
    ? path.resolve(process.env.ARCHIVE_MEDIA_DIR.trim())
    : path.join(rootDir, 'public', 'archive-media');

  if (fs.existsSync(gcArchiveMediaDir)) {
    app.use('/archive-media', express.static(gcArchiveMediaDir, {
      index: false,
      immutable: true,
      maxAge: '30d'
    }));
  }
}
`;

if (!code.includes('persistent archive-media static mount v8.4.1')) {
  const appLine = 'const app = express();';
  const idx = code.indexOf(appLine);
  if (idx === -1) {
    console.error('[Archivo media v8.4.1] No se encontró const app = express();');
    process.exit(1);
  }
  const insertAt = idx + appLine.length;
  code = code.slice(0, insertAt) + '\n' + staticBlock + code.slice(insertAt);
}

/**
 * Quita el JS/CSS de subida local del editor, porque ahora vive en imagen-url.
 */
if (fs.existsSync(editorFile)) {
  const backupEditor = `${editorFile}.backup-remove-upload-box-v841-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  let editor = fs.readFileSync(editorFile, 'utf8');
  fs.copyFileSync(editorFile, backupEditor);

  editor = editor
    .replace(/\n?\s*<link rel="stylesheet" href="\/gc-archivo-local-upload-v84\.css" \/>\n?/g, '\n')
    .replace(/\n?\s*<script src="\/gc-archivo-local-upload-v84\.js" is:inline><\/script>\n?/g, '\n');

  fs.writeFileSync(editorFile, editor, 'utf8');
  console.log('[Archivo media v8.4.1] Bloque de subida eliminado del editor.');
  console.log(`[Archivo media v8.4.1] Backup editor: ${backupEditor}`);
}

fs.writeFileSync(serverFile, code, 'utf8');

console.log('[Archivo media v8.4.1] Montaje persistente /archive-media asegurado.');
console.log('[Archivo media v8.4.1] Imagen URL ahora contiene URL + subida desde PC.');
console.log(`[Archivo media v8.4.1] Backup servidor: ${backupServer}`);
