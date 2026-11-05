import { t } from './i18n.js';
import { icon } from './icons.js';
import { SERVICES } from './config.js';
import { priceLabel, ago, isFav, toggleFav, isFresh, money, num, shortId } from './store.js';
import { placeName } from './places.js';

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const listingTitle = x => x.headline || x.title;

export function facts(x) {
  if (x.kind === 'car') {
    return [x.year, x.body ? t('body.' + x.body) : '', x.mileage ? `${num(x.mileage)} km` : '', x.gearbox ? t('gearbox.' + x.gearbox) : '', x.fuel ? t('fuel.' + x.fuel) : ''].filter(Boolean).map(String);
  }
  return [
    x.rooms != null ? t('card.beds', x.rooms) : x.kind !== 'apartment' ? t('kind.' + x.kind) : '',
    x.area ? `${Math.round(x.area)} m²` : '',
    x.floor ? t('card.floor', x.floor, x.floors) : '',
  ].filter(Boolean);
}

export function favButton(id, cls = 'fav') {
  const on = isFav(id);
  return `<button class="${cls}${on ? ' on' : ''}" type="button" data-fav="${esc(id)}" aria-pressed="${on}" aria-label="${esc(t(on ? 'card.fav.remove' : 'card.fav.add'))}">${icon('heart')}</button>`;
}

export function card(x, { eager = false } = {}) {
  const photos = (x.photos || []).slice(0, 6);
  const p = priceLabel(x);
  const badges = [
    x.exclusive && `<span class="badge badge-accent">${t('card.exclusive')}</span>`,
    isFresh(x) && `<span class="badge">${t('card.new')}</span>`,
    x.completion && `<span class="badge">${esc(t('card.completion', x.completion))}</span>`,
    x.service === 'commercial' && x.deal && `<span class="badge">${esc(t('deal.' + x.deal))}</span>`,
  ].filter(Boolean).join('');
  const sub = x.ppsqm_usd ? `${money(x.ppsqm_usd)}/m²` : '';
  return `
<article class="card" data-id="${esc(x.id)}">
  <div class="card-media">
    <div class="slides" data-slides>
      ${photos.length ? photos.map((src, i) => `<img src="${esc(src)}" alt="${esc(listingTitle(x))}${i ? ' · ' + (i + 1) : ''}" ${i || !eager ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async" draggable="false">`).join('')
        : `<div class="noimg">${icon('image')}</div>`}
    </div>
    ${photos.length > 1 ? `
    <button class="slide-btn prev" type="button" data-slide="-1" aria-label="${t('card.prev')}">${icon('left')}</button>
    <button class="slide-btn next" type="button" data-slide="1" aria-label="${t('card.next')}">${icon('right')}</button>
    <div class="dots" aria-hidden="true">${photos.map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div>` : ''}
    <div class="badges">${badges}</div>
    <button class="card-share" type="button" data-share-id="${esc(x.id)}" aria-label="${esc(t('l.share'))}">${icon('share')}</button>
    ${favButton(x.id)}
  </div>
  <a class="card-body" href="#/listing/${esc(x.id)}">
    <div class="card-price"><b>${esc(p.main)}</b>${p.period ? `<span>${p.period}</span>` : ''}${p.approx ? `<em class="card-approx">${esc(p.approx)}</em>` : ''}${sub ? `<em>${esc(sub)}</em>` : ''}<small class="card-id" title="${esc(t('l.id'))}">ID ${esc(shortId(x.id))}</small></div>
    <h3>${esc(listingTitle(x))}</h3>
    <p class="card-facts">${facts(x).map(esc).join('<i></i>')}</p>
    <p class="card-loc">${icon('pin')}<span>${esc(x.pickup || [placeName(x.district), x.metro && x.metro !== x.district ? placeName(x.metro) : ''].filter(Boolean).join(' · ') || t('city'))}</span><time>${esc(ago(x.published_at))}</time></p>
  </a>
</article>`;
}

export function rail(id, title, items, href) {
  if (!items.length) return '';
  return `
<section class="section rail-section">
  <div class="container">
    <div class="section-head">
      <h2>${esc(title)}</h2>
      <div class="rail-ctrl">
        ${href ? `<a class="link-arrow" href="${href}">${t('home.see.all')} ${icon('arrow')}</a>` : ''}
        <button class="round-btn" type="button" data-rail="${id}" data-dir="-1" aria-label="←">${icon('left')}</button>
        <button class="round-btn" type="button" data-rail="${id}" data-dir="1" aria-label="→">${icon('right')}</button>
      </div>
    </div>
  </div>
  <div class="rail" id="${id}">${items.map(x => card(x)).join('')}</div>
</section>`;
}

export function empty(title, text, action = '') {
  return `<div class="empty"><div class="empty-ico">${icon('search')}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}

// First load of the catalogue: placeholder cards instead of an empty page.
export const loadingView = () => `<div class="container page-pad" aria-busy="true"><p class="loading-line" role="status">${esc(t('loading'))}</p><div class="grid">${skeletons(6)}</div></div>`;
export const errorView = () => `<div class="container page-pad">${empty(t('error.t'), t('error'), `<button type="button" class="btn btn-primary" data-retry>${esc(t('retry'))}</button>`)}</div>`;

export const skeletons = n => Array.from({ length: n }, () => '<div class="card skeleton"><div class="card-media"></div><div class="card-body"><i></i><i></i><i></i></div></div>').join('');

export function toast(text) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

export const serviceTitle = id => t('svc.' + id);
export const serviceIcon = id => SERVICES[id]?.icon || 'search';

// ---------- global delegated behaviour for cards, carousels and rails ----------
export function installInteractions() {
  document.addEventListener('click', e => {
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      e.preventDefault();
      const on = toggleFav(fav.dataset.fav);
      document.querySelectorAll(`[data-fav="${CSS.escape(fav.dataset.fav)}"]`).forEach(b => {
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on);
        b.setAttribute('aria-label', t(on ? 'card.fav.remove' : 'card.fav.add'));
        if (b.dataset.label != null) b.querySelector('span').textContent = t(on ? 'l.saved' : 'l.save');
      });
      fav.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 260 });
      return;
    }
    const slide = e.target.closest('[data-slide]');
    if (slide) {
      e.preventDefault();
      const track = slide.parentElement.querySelector('[data-slides]');
      track.scrollBy({ left: track.clientWidth * +slide.dataset.slide, behavior: 'smooth' });
      return;
    }
    const railBtn = e.target.closest('[data-rail]');
    if (railBtn) {
      const r = document.getElementById(railBtn.dataset.rail);
      r?.scrollBy({ left: r.clientWidth * 0.85 * +railBtn.dataset.dir, behavior: 'smooth' });
      return;
    }
    // Tapping a photo opens the listing (the slides are not inside the link to keep swipe smooth).
    const media = e.target.closest('.card .slides');
    if (media) location.hash = '#/listing/' + media.closest('.card').dataset.id;
  });

  // Scroll events do not bubble, so listen in the capture phase to update carousel dots.
  document.addEventListener('scroll', e => {
    const track = e.target;
    if (!(track instanceof Element) || !track.matches('[data-slides]')) return;
    const i = Math.round(track.scrollLeft / track.clientWidth);
    track.parentElement.querySelectorAll('.dots i').forEach((d, k) => d.classList.toggle('on', k === i));
  }, true);
}
