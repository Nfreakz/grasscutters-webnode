const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'src', 'components', 'AuthHeader.astro');

if (!fs.existsSync(target)) {
  console.error('[GC USER MENU ORDER] No encuentro ' + target);
  process.exit(1);
}

let content = fs.readFileSync(target, 'utf8');
const original = content;

if (content.includes('GC_USER_MENU_ORDER_V15_33_1')) {
  console.log('[GC USER MENU ORDER] v15.33.1 ya parece aplicado.');
  process.exit(0);
}

const css = `
  /* GC_USER_MENU_ORDER_V15_33_1 */
  .gc-public-actions,
  .gc-topbar__right{
    display:flex;
    align-items:center;
  }

  .gc-public-actions .gc-theme--dropdown,
  .gc-topbar__right .gc-theme--dropdown{
    order:80;
  }

  .gc-public-actions .gc-user-menu-v1533,
  .gc-topbar__right .gc-user-menu-v1533{
    order:90;
    margin-left:4px;
  }

  .gc-public-actions [data-auth-link],
  .gc-topbar__right [data-auth-link]{
    order:90;
  }

  @media(max-width:760px){
    .gc-public-actions .gc-theme--dropdown,
    .gc-topbar__right .gc-theme--dropdown{
      order:80;
    }

    .gc-public-actions .gc-user-menu-v1533,
    .gc-topbar__right .gc-user-menu-v1533{
      order:90;
      margin-left:2px;
    }
  }
`;

const marker = '  /* GC_USER_AVATAR_MENU_V15_33 */';
if (!content.includes(marker)) {
  console.error('[GC USER MENU ORDER] No encuentro marcador de AuthHeader v15.33.');
  process.exit(1);
}

content = content.replace(marker, marker + css);

const backup = target + '.bak-v15-33-1-order';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, 'utf8');

fs.writeFileSync(target, content, 'utf8');

console.log('[GC USER MENU ORDER] Orden de paleta/avatar reforzado.');
console.log('[GC USER MENU ORDER] Backup: ' + backup);
console.log('[GC USER MENU ORDER] Ejecuta: npm run build');
