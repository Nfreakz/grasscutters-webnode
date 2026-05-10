/*
  GrassCutters - Fix perfil cargando
  Corrige comillas mal escapadas en el bloque de vincular piloto de src/pages/perfil.astro.
*/
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const profilePath = path.join(root, 'src', 'pages', 'perfil.astro');

if (!fs.existsSync(profilePath)) {
  console.error('ERROR: No encuentro src/pages/perfil.astro. Ejecuta este script desde la raíz del proyecto.');
  process.exit(1);
}

let source = fs.readFileSync(profilePath, 'utf8');
const original = source;

const backupPath = profilePath + `.backup-profile-loading-fix-${new Date().toISOString().replace(/[:.]/g, '-')}`;

const replacements = [
  [
    'linkUi.select.innerHTML = "<option value="">Sin pilotos con ese filtro</option>";',
    "linkUi.select.innerHTML = '<option value=\"\">Sin pilotos con ese filtro</option>';"
  ],
  [
    'linkUi.select.innerHTML = "<option value="">Cargando pilotos...</option>";',
    "linkUi.select.innerHTML = '<option value=\"\">Cargando pilotos...</option>';"
  ],
  [
    'return "<option value="" + escapeHtml(id) + "">" + escapeHtml(label) + "</option>";',
    "return '<option value=\"' + escapeHtml(id) + '\">' + escapeHtml(label) + '</option>';"
  ],
  [
    '"<span title="" + escapeHtml(guid) + "">Steam GUID: " + escapeHtml(shortGuid) + "</span>";',
    "'<span title=\"' + escapeHtml(guid) + '\">Steam GUID: ' + escapeHtml(shortGuid) + '</span>';"
  ]
];

let touched = 0;
for (const [from, to] of replacements) {
  if (source.includes(from)) {
    source = source.split(from).join(to);
    touched += 1;
  }
}

// Fallbacks por si el archivo tenía espacios distintos.
source = source.replace(
  /linkUi\.select\.innerHTML\s*=\s*"<option value="">Sin pilotos con ese filtro<\/option>";/g,
  "linkUi.select.innerHTML = '<option value=\"\">Sin pilotos con ese filtro</option>';"
);
source = source.replace(
  /linkUi\.select\.innerHTML\s*=\s*"<option value="">Cargando pilotos\.\.\.<\/option>";/g,
  "linkUi.select.innerHTML = '<option value=\"\">Cargando pilotos...</option>';"
);
source = source.replace(
  /return\s+"<option value="" \+ escapeHtml\(id\) \+ "">" \+ escapeHtml\(label\) \+ "<\/option>";/g,
  "return '<option value=\"' + escapeHtml(id) + '\">' + escapeHtml(label) + '</option>';"
);
source = source.replace(
  /"<span title="" \+ escapeHtml\(guid\) \+ "">Steam GUID: " \+ escapeHtml\(shortGuid\) \+ "<\/span>";/g,
  "'<span title=\"' + escapeHtml(guid) + '\">Steam GUID: ' + escapeHtml(shortGuid) + '</span>'"
);

if (source === original) {
  console.log('No se han encontrado las comillas rotas conocidas. Haré igualmente una comprobación de sintaxis.');
} else {
  fs.writeFileSync(backupPath, original, 'utf8');
  fs.writeFileSync(profilePath, source, 'utf8');
  console.log('OK: perfil.astro corregido.');
  console.log('Backup:', path.relative(root, backupPath));
}

// Comprobación de sintaxis de los scripts inline de perfil.astro.
const updated = fs.readFileSync(profilePath, 'utf8');
const scripts = [...updated.matchAll(/<script\s+is:inline>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!scripts.length) {
  console.warn('AVISO: no he encontrado <script is:inline> en perfil.astro.');
  process.exit(0);
}

try {
  for (const script of scripts) {
    new Function(script);
  }
  console.log('OK: JavaScript inline de perfil.astro compila correctamente.');
} catch (error) {
  console.error('ERROR: perfil.astro aún tiene un problema de JavaScript:');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
