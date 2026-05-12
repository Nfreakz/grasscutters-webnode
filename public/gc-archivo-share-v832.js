(() => {
  const SHARE_MARK = 'gcArchiveShareV835';
  const PUBLIC_ORIGIN = 'https://grasscuttersracing.com';

  const icons = {
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-1v1a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h1V7Zm2 1h3a3 3 0 0 1 3 3v3h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v1Zm-3 2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1H7Z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.04 3a8.77 8.77 0 0 0-7.47 13.36L3.5 21l4.76-1.02A8.76 8.76 0 1 0 12.04 3Zm0 2a6.76 6.76 0 1 1-3.18 12.72l-.32-.17-2.42.52.54-2.34-.2-.34A6.76 6.76 0 0 1 12.04 5Zm-3.1 3.55c-.16 0-.41.06-.63.3-.22.23-.83.81-.83 1.98s.85 2.3.97 2.46c.12.16 1.66 2.66 4.1 3.62 2.03.8 2.44.64 2.88.6.44-.04 1.43-.58 1.63-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28-.24-.12-1.43-.71-1.65-.79-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.42-1.34-1.66-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46Z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.9 4.2c.28-.12.6.12.53.44l-3.02 14.25c-.07.34-.49.47-.75.24l-4.23-3.56-2.13 2.05c-.24.23-.64.1-.7-.23l-.8-4.2-3.9-1.3c-.35-.12-.37-.61-.03-.76L20.9 4.2Zm-3.1 3.04-8.8 5.47 1.72.57 5.4-3.4c.14-.09.3.1.18.22l-4.34 4.17-.47 2.12 1.28-1.23c.28-.27.72-.28 1.01-.03l2.9 2.44 2.2-10.37-1.08.06Z"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.4 4h3.3l4.05 5.4L17.5 4h1.95l-5.8 6.6L20 20h-3.3l-4.52-6.04L6.87 20H4.9l6.37-7.25L5.4 4Zm2.35 1.45 9.68 13.1h1.07L8.82 5.45H7.75Z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.4 21v-7.6h2.55l.38-2.96H13.4V8.55c0-.86.24-1.44 1.47-1.44h1.57V4.46c-.27-.04-1.2-.12-2.29-.12-2.26 0-3.8 1.38-3.8 3.9v2.2H7.8v2.96h2.55V21h3.05Z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 8.8H3.4V21h2.8V8.8ZM4.8 3a1.62 1.62 0 1 0 0 3.24A1.62 1.62 0 0 0 4.8 3Zm6.1 5.8H8.2V21H11v-6.02c0-1.59.3-3.12 2.26-3.12 1.93 0 1.96 1.8 1.96 3.22V21H18v-6.68c0-3.28-.7-5.8-4.54-5.8-1.84 0-3.08 1.01-3.58 1.97h-.04l.06-1.69Z"/></svg>',
    reddit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.2a2.1 2.1 0 0 0-3.55-1.51 9.9 9.9 0 0 0-4.7-1.32l.8-3.74 2.58.55a1.7 1.7 0 1 0 .22-1.05l-3.13-.67a.54.54 0 0 0-.64.42l-.96 4.49a9.95 9.95 0 0 0-5.05 1.3 2.1 2.1 0 1 0-2.31 3.43 4.08 4.08 0 0 0-.06.68c0 3 3.5 5.42 7.8 5.42s7.8-2.43 7.8-5.42c0-.22-.02-.44-.06-.66A2.1 2.1 0 0 0 21 12.2ZM8.7 13.7a1.18 1.18 0 1 1 0-2.36 1.18 1.18 0 0 1 0 2.36Zm6.35 3.22c-.85.85-2.55.91-3.05.91-.5 0-2.2-.06-3.05-.91a.55.55 0 0 1 .78-.78c.54.54 1.75.6 2.27.6.52 0 1.73-.06 2.27-.6a.55.55 0 1 1 .78.78Zm.25-3.22a1.18 1.18 0 1 1 0-2.36 1.18 1.18 0 0 1 0 2.36Z"/></svg>',
    email: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 2v.35l7 4.38 7-4.38V7H5Zm14 2.72-6.47 4.04a1 1 0 0 1-1.06 0L5 9.72V17h14V9.72Z"/></svg>'
  };

  function isArchiveDetailPage() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts[0] === 'archivo' && parts.length >= 3;
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function pageTitle() {
    return cleanText(document.querySelector('h1')?.textContent || document.title || 'Archivo Motorsport');
  }

  function pageSummary() {
    const candidates = [
      document.querySelector('meta[name="description"]')?.getAttribute('content'),
      document.querySelector('.gc-lead')?.textContent,
      document.querySelector('.gc-subtitle')?.textContent,
    ];
    return cleanText(candidates.find(Boolean) || '');
  }

  function canonicalUrl() {
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
    if (canonical && !canonical.includes('localhost') && !canonical.includes('127.0.0.1')) return canonical;
    return `${PUBLIC_ORIGIN}${window.location.pathname || '/archivo/'}${window.location.search || ''}`;
  }

  function encoded(value) {
    return encodeURIComponent(value);
  }

  function buildShareLinks() {
    const url = canonicalUrl();
    const title = pageTitle();
    const summary = pageSummary();
    const text = summary ? `${title} · ${summary}` : title;

    return [
      { key: 'copy', label: 'Copiar enlace', href: url, action: 'copy' },
      { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${encoded(`${text}\n${url}`)}` },
      { key: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${encoded(url)}&text=${encoded(text)}` },
      { key: 'x', label: 'X', href: `https://twitter.com/intent/tweet?url=${encoded(url)}&text=${encoded(text)}` },
      { key: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encoded(url)}` },
      { key: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encoded(url)}` },
      { key: 'reddit', label: 'Reddit', href: `https://www.reddit.com/submit?url=${encoded(url)}&title=${encoded(title)}` },
      { key: 'email', label: 'Email', href: `mailto:?subject=${encoded(`GrassCutters Racing · ${title}`)}&body=${encoded(`${text}\n\n${url}`)}` },
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

  function shareBarHtml() {
    const links = buildShareLinks();
    const url = canonicalUrl();

    return `
      <nav class="gc-archive-share gc-archive-share--minimal" data-${SHARE_MARK}="true" aria-label="Compartir ficha">
        <span class="gc-archive-share__label">Compartir</span>
        <div class="gc-archive-share__icons">
          ${links.map((link) => link.action === 'copy'
            ? `<button class="gc-archive-share__icon is-${link.key}" type="button" data-copy-link="${url}" title="${link.label}" aria-label="${link.label}">${icons[link.key]}</button>`
            : `<a class="gc-archive-share__icon is-${link.key}" href="${link.href}" title="${link.label}" aria-label="${link.label}" target="_blank" rel="noopener noreferrer">${icons[link.key]}</a>`
          ).join('')}
        </div>
        <span class="gc-archive-share__msg" aria-live="polite"></span>
      </nav>
    `;
  }

  function insertPublicShareBar() {
    if (!isArchiveDetailPage()) return;
    if (document.querySelector(`[data-${SHARE_MARK}]`)) return;

    const target =
      document.querySelector('[data-archive-detail-share]') ||
      document.querySelector('.archivo-content-grid') ||
      document.querySelector('main') ||
      document.querySelector('.gc-page');

    if (!target) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = shareBarHtml();
    const share = wrapper.firstElementChild;

    if (target.hasAttribute('data-archive-detail-share')) {
      target.replaceWith(share);
    } else {
      target.insertAdjacentElement('afterend', share);
    }
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
        if (msg) msg.textContent = 'Copiado';
        button.classList.add('is-copied');
        setTimeout(() => {
          button.classList.remove('is-copied');
          if (msg) msg.textContent = '';
        }, 1400);
      } catch {
        if (msg) msg.textContent = 'No se pudo copiar';
      }
    }, true);
  }

  function boot() {
    insertPublicShareBar();
    bindCopyButtons();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
