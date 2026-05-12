(() => {
  const SHARE_MARK = 'gcArchiveShareV832';

  function isArchiveDetailPage() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts[0] === 'archivo' && parts.length >= 3;
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function pageTitle() {
    const h1 = document.querySelector('h1');
    return cleanText(h1?.textContent || document.title || 'Archivo Motorsport');
  }

  function pageSummary() {
    const candidates = [
      document.querySelector('meta[name="description"]')?.getAttribute('content'),
      document.querySelector('.gc-subtitle')?.textContent,
      document.querySelector('.gc-archive-detail__summary')?.textContent,
      document.querySelector('p')?.textContent,
    ];
    return cleanText(candidates.find(Boolean) || '');
  }

  function canonicalUrl() {
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
    return canonical || window.location.href.split('#')[0];
  }

  function encoded(value) {
    return encodeURIComponent(value);
  }

  function buildShareLinks() {
    const url = canonicalUrl();
    const title = pageTitle();
    const summary = pageSummary();
    const text = summary ? `${title} · ${summary}` : title;
    const emailSubject = `GrassCutters Racing · ${title}`;
    const emailBody = `${text}\n\n${url}`;

    return [
      {
        key: 'copy',
        label: 'Copiar enlace',
        href: url,
        action: 'copy',
      },
      {
        key: 'whatsapp',
        label: 'WhatsApp',
        href: `https://wa.me/?text=${encoded(`${text}\n${url}`)}`,
      },
      {
        key: 'telegram',
        label: 'Telegram',
        href: `https://t.me/share/url?url=${encoded(url)}&text=${encoded(text)}`,
      },
      {
        key: 'x',
        label: 'X',
        href: `https://twitter.com/intent/tweet?url=${encoded(url)}&text=${encoded(text)}`,
      },
      {
        key: 'facebook',
        label: 'Facebook',
        href: `https://www.facebook.com/sharer/sharer.php?u=${encoded(url)}`,
      },
      {
        key: 'linkedin',
        label: 'LinkedIn',
        href: `https://www.linkedin.com/sharing/share-offsite/?url=${encoded(url)}`,
      },
      {
        key: 'reddit',
        label: 'Reddit',
        href: `https://www.reddit.com/submit?url=${encoded(url)}&title=${encoded(title)}`,
      },
      {
        key: 'email',
        label: 'Email',
        href: `mailto:?subject=${encoded(emailSubject)}&body=${encoded(emailBody)}`,
      },
    ];
  }

  async function copyToClipboard(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }

    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', 'true');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand('copy');
    input.remove();
    return ok;
  }

  function shareBarHtml(mode = 'public') {
    const links = buildShareLinks();
    const url = canonicalUrl();
    const title = mode === 'admin' ? 'Compartir ficha pública' : 'Compartir ficha';

    return `
      <section class="gc-archive-share gc-archive-share--${mode}" data-${SHARE_MARK}="true">
        <div class="gc-archive-share__head">
          <span class="gc-archive-share__kicker">Archivo Motorsport</span>
          <h2>${title}</h2>
          <p>Comparte esta ficha o copia el enlace para Discord, foros y anuncios.</p>
        </div>
        <div class="gc-archive-share__actions">
          ${links.map((link) => link.action === 'copy'
            ? `<button class="gc-archive-share__btn is-copy" type="button" data-copy-link="${url}">${link.label}</button>`
            : `<a class="gc-archive-share__btn is-${link.key}" href="${link.href}" target="_blank" rel="noopener noreferrer">${link.label}</a>`
          ).join('')}
        </div>
        <div class="gc-archive-share__url">
          <input value="${url.replace(/"/g, '&quot;')}" readonly aria-label="URL de la ficha" />
          <button type="button" data-copy-link="${url}">Copiar</button>
        </div>
        <p class="gc-archive-share__msg" aria-live="polite"></p>
      </section>
    `;
  }

  function findPublicTarget() {
    return (
      document.querySelector('[data-archive-detail-share]') ||
      document.querySelector('.gc-archive-detail') ||
      document.querySelector('.gc-archive-item') ||
      document.querySelector('article') ||
      document.querySelector('main') ||
      document.querySelector('.gc-page')
    );
  }

  function insertPublicShareBar() {
    if (!isArchiveDetailPage()) return;
    if (document.querySelector(`[data-${SHARE_MARK}]`)) return;

    const target = findPublicTarget();
    if (!target) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = shareBarHtml('public');
    const share = wrapper.firstElementChild;

    const relationSection = document.querySelector('#archivoRelationsPanel, .gc-archive-relations, [data-archive-relations]');
    if (relationSection?.parentElement) relationSection.parentElement.insertBefore(share, relationSection);
    else target.insertAdjacentElement('afterend', share);
  }

  function publicUrlFromAdminPath() {
    const path = window.location.pathname;
    const match = path.match(/\/admin\/archivo\/editar\/([^/]+)/);
    if (!match) return canonicalUrl();

    const category = document.getElementById('fieldCategory')?.value ||
      document.getElementById('fieldType')?.value ||
      'general';
    const slug = document.getElementById('fieldSlug')?.value ||
      decodeURIComponent(match[1]);

    const map = {
      circuit: 'circuitos',
      driver: 'pilotos',
      pilot: 'pilotos',
      vehicle: 'vehiculos',
      championship: 'campeonatos',
      record: 'records',
      glossary: 'glosario',
      circuitos: 'circuitos',
      pilotos: 'pilotos',
      vehiculos: 'vehiculos',
      campeonatos: 'campeonatos',
      records: 'records',
      glosario: 'glosario',
    };

    const finalCategory = map[String(category).toLowerCase()] || String(category || 'general').toLowerCase();
    const finalSlug = String(slug || '').trim();
    return `${window.location.origin}/archivo/${encodeURIComponent(finalCategory)}/${encodeURIComponent(finalSlug)}/`;
  }

  function insertAdminShareBox() {
    if (!window.location.pathname.includes('/admin/archivo/editar/')) return;
    if (document.querySelector(`[data-${SHARE_MARK}]`)) return;

    const actions = document.querySelector('#archiveMainForm .gc-actions') ||
      document.querySelector('.gc-archive-editor .gc-actions') ||
      document.querySelector('form');

    if (!actions?.parentElement) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = shareBarHtml('admin');
    const share = wrapper.firstElementChild;

    const refreshUrl = () => {
      const url = publicUrlFromAdminPath();
      share.querySelectorAll('[data-copy-link]').forEach((button) => button.setAttribute('data-copy-link', url));
      const input = share.querySelector('.gc-archive-share__url input');
      if (input) input.value = url;
    };

    actions.parentElement.insertBefore(share, actions.nextSibling);
    refreshUrl();

    document.getElementById('fieldCategory')?.addEventListener('change', refreshUrl);
    document.getElementById('fieldType')?.addEventListener('change', refreshUrl);
    document.getElementById('fieldSlug')?.addEventListener('input', refreshUrl);
  }

  function bindCopyButtons() {
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-copy-link]');
      if (!button) return;

      event.preventDefault();
      const root = button.closest('.gc-archive-share');
      const msg = root?.querySelector('.gc-archive-share__msg');
      const url = button.getAttribute('data-copy-link') || canonicalUrl();

      try {
        await copyToClipboard(url);
        if (msg) msg.textContent = 'Enlace copiado. Listo para pegar en Discord.';
        button.classList.add('is-copied');
        setTimeout(() => button.classList.remove('is-copied'), 1200);
      } catch {
        if (msg) msg.textContent = 'No se pudo copiar automáticamente. Copia el enlace del campo.';
      }
    }, true);
  }

  function boot() {
    insertPublicShareBar();
    insertAdminShareBox();
    bindCopyButtons();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
