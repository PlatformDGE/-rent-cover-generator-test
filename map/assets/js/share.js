import { t } from './i18n.js';
import { icon } from './icons.js';
import { esc, listingTitle, toast } from './components.js';
import { priceLabel } from './store.js';

// Brand marks (simplified, single-path) for the share targets.
const BRAND = {
  telegram: '<path fill="#fff" d="M17.6 7.2 15.4 17c-.2.7-.6.9-1.2.6l-3.3-2.4-1.6 1.5c-.2.2-.3.3-.7.3l.2-3.4 6.2-5.6c.3-.2-.1-.4-.4-.2l-7.7 4.8-3.3-1c-.7-.2-.7-.7.2-1l12.9-5c.6-.2 1.1.1.9 1.6Z"/>',
  whatsapp: '<path fill="#fff" d="M12 4.2a7.8 7.8 0 0 0-6.7 11.8L4.2 19.8l3.9-1A7.8 7.8 0 1 0 12 4.2Zm4.5 11c-.2.5-1.1 1-1.6 1.1-.4 0-.9.1-2.9-.7-2.4-1-4-3.5-4.1-3.6-.1-.2-1-1.3-1-2.5s.6-1.8.9-2c.2-.3.5-.3.6-.3h.5c.1 0 .4 0 .6.4l.8 1.9c.1.1.1.3 0 .5l-.3.4-.4.4c-.1.1-.3.3-.1.5.1.3.6 1 1.3 1.7.9.8 1.7 1.1 1.9 1.2.3.1.4.1.6-.1l.8-1c.2-.2.4-.2.6-.1l1.8.9c.3.1.4.2.5.3 0 .1 0 .6-.1 1Z"/>',
  facebook: '<path fill="#fff" d="M13.4 20v-7.1h2.4l.4-2.8h-2.8V8.3c0-.8.2-1.4 1.4-1.4h1.5V4.4c-.3 0-1.1-.1-2.1-.1-2.1 0-3.6 1.3-3.6 3.7v2.1H8.2v2.8h2.4V20h2.8Z"/>',
  instagram: '<rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="16.3" cy="7.7" r="1" fill="#fff"/>',
  viber: '<path fill="#fff" d="M12 4c-4.6 0-7.5 1.8-7.5 6.4 0 2.6.9 4.3 2.6 5.3v2.8c0 .4.5.6.8.3l2.2-2.1c.6.1 1.2.1 1.9.1 4.6 0 7.5-1.8 7.5-6.4S16.6 4 12 4Zm3.3 9.4c-.3.6-1 1-1.6.8-2.3-.7-4.2-2.6-4.9-4.9-.2-.6.2-1.3.8-1.6.3-.1.6 0 .8.2l.8 1c.2.3.2.6 0 .9l-.3.4c.4.9 1.1 1.6 2 2l.4-.3c.3-.2.6-.2.9 0l1 .8c.2.2.3.5.1.7Z"/>',
};

export function shareUrl(x) {
  // Static preview page (photo, title, price for messengers) that forwards to the listing.
  return new URL(`share/${encodeURIComponent(x.id)}.html`, location.href.split('#')[0]).href;
}

export function shareText(x) {
  const p = priceLabel(x);
  return `${listingTitle(x)} — ${p.main}${p.period ? ' ' + p.period : ''}`;
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Glass share sheet: Telegram first, then WhatsApp, Facebook, Instagram, Viber, copy, system share. */
export function openShare(x) {
  const url = shareUrl(x);
  const text = shareText(x);
  const targets = [
    ['telegram', 'Telegram', `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`],
    ['whatsapp', 'WhatsApp', `https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`],
    ['facebook', 'Facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`],
    ['instagram', 'Instagram', ''],
    ['viber', 'Viber', `viber://forward?text=${encodeURIComponent(text + '\n' + url)}`],
  ];
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap share-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <aside class="sheet share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <header class="sheet-head"><span class="grab"></span><h2 id="share-title">${esc(t('share.title'))}</h2>
        <button class="icon-btn" type="button" data-close aria-label="${esc(t('nav.close'))}">${icon('x')}</button></header>
      <div class="share-body">
        <div class="share-preview">
          ${x.photos?.[0] ? `<img src="${esc(x.photos[0])}" alt="">` : `<span class="noimg">${icon('image')}</span>`}
          <div><b>${esc(listingTitle(x))}</b><span>${esc(text.split(' — ').slice(1).join(' — '))}</span></div>
        </div>
        <div class="share-grid">
          ${targets.map(([key, label, href]) => href
            ? `<a class="share-target" href="${esc(href)}" target="_blank" rel="noopener" data-target="${key}"><i class="st-${key}"><svg viewBox="0 0 24 24" aria-hidden="true">${BRAND[key]}</svg></i><span>${label}</span></a>`
            : `<button type="button" class="share-target" data-target="${key}"><i class="st-${key}"><svg viewBox="0 0 24 24" aria-hidden="true">${BRAND[key]}</svg></i><span>${label}</span></button>`).join('')}
          ${navigator.share ? `<button type="button" class="share-target" data-target="native"><i class="st-more">${icon('share')}</i><span>${esc(t('share.more'))}</span></button>` : ''}
        </div>
        <div class="share-link">
          <input type="text" readonly value="${esc(url)}" aria-label="${esc(t('share.link'))}">
          <button type="button" class="btn btn-primary" data-copy>${icon('check')}<span>${esc(t('share.copy'))}</span></button>
        </div>
      </div>
    </aside>`;

  const close = () => {
    wrap.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('locked');
    setTimeout(() => wrap.remove(), 240);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('click', async e => {
    if (e.target.closest('[data-close]')) return close();
    if (e.target.closest('[data-copy]')) {
      if (await copy(url)) toast(t('l.copied'));
      wrap.querySelector('.share-link input').select();
      return;
    }
    const target = e.target.closest('[data-target]')?.dataset.target;
    if (target === 'native') {
      try { await navigator.share({ title: listingTitle(x), text, url }); close(); } catch {}
    } else if (target === 'instagram') {
      // Instagram has no web share link: hand the link to the system sheet (Instagram Direct / Stories),
      // or copy it so it can be pasted in Instagram.
      if (navigator.share) {
        try { await navigator.share({ title: listingTitle(x), text, url }); close(); return; } catch {}
      }
      if (await copy(url)) toast(t('share.insta'));
    } else if (target) {
      setTimeout(close, 300);
    }
  });
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  document.body.classList.add('locked');
  requestAnimationFrame(() => wrap.classList.add('open'));
}
