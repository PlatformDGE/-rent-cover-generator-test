import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { SERVICES, AMENITY_ORDER, CONTACT, telegramHref, phoneHref, whatsappHref } from '../config.js';
import { esc, listingTitle, favButton, rail, empty, toast } from '../components.js';
import { createMap } from '../map.js';
import { openShare } from '../share.js';
import { cameFromSite, scrollRoot } from '../scroll.js';
import { priceLabel, money, ago, isFav, num, addRecent } from '../store.js';
import { placeName } from '../places.js';

function lightbox(photos, start, title) {
  let i = start;
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', title);
  el.innerHTML = `
    <div class="lb-top"><span class="lb-count"></span><button class="icon-btn" data-x aria-label="${esc(t('nav.close'))}">${icon('x')}</button></div>
    <div class="lb-track">${photos.map(p => `<figure><img src="${esc(p)}" alt="${esc(title)}" loading="lazy" decoding="async"></figure>`).join('')}</div>
    <button class="lb-nav prev" data-d="-1" aria-label="${esc(t('card.prev'))}">${icon('left')}</button>
    <button class="lb-nav next" data-d="1" aria-label="${esc(t('card.next'))}">${icon('right')}</button>`;
  const track = el.querySelector('.lb-track');
  const count = el.querySelector('.lb-count');
  const go = (n, smooth = true) => {
    i = Math.max(0, Math.min(photos.length - 1, n));
    track.scrollTo({ left: i * track.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  };
  track.addEventListener('scroll', () => {
    i = Math.round(track.scrollLeft / track.clientWidth);
    count.textContent = `${i + 1} / ${photos.length}`;
  });
  const close = () => { document.removeEventListener('keydown', key); document.body.classList.remove('locked'); el.remove(); };
  const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); };
  el.addEventListener('click', e => {
    if (e.target.closest('[data-x]')) close();
    const d = e.target.closest('[data-d]');
    if (d) go(i + +d.dataset.d);
  });
  document.addEventListener('keydown', key);
  document.body.append(el);
  document.body.classList.add('locked');
  count.textContent = `${i + 1} / ${photos.length}`;
  requestAnimationFrame(() => go(start, false));
  el.querySelector('[data-x]').focus();
}

function similar(data, x) {
  const p = x.price_usd || 0;
  return data.items
    .filter(y => y.id !== x.id && y.service === x.service && y.photos?.length)
    .map(y => ({ y, s: (y.district === x.district ? 0 : 1) + (p && y.price_usd ? Math.abs(Math.log(y.price_usd / p)) : 1) + (y.rooms === x.rooms ? 0 : 0.5) }))
    .sort((a, b) => a.s - b.s)
    .slice(0, 10)
    .map(a => a.y);
}

export function renderListing(root, data, id) {
  const x = data.byId.get(id);
  if (!x) {
    root.innerHTML = `<div class="container page-pad">${empty(t('l.notfound'), '', `<a class="btn btn-primary" href="#/rent">${t('l.back')}</a>`)}</div>`;
    return;
  }
  addRecent(x.id);
  const svc = SERVICES[x.service];
  const title = listingTitle(x);
  const p = priceLabel(x);
  const photos = x.photos || [];
  const url = location.href;
  const agent = x.agent || {};
  // The message carries the Telegram post link: in the chat it unfolds into the
  // post with photos, so the agent sees the exact object at once.
  const objectLink = x.post_url || url;
  const symbol = { USD: '$', GEL: '₾', EUR: '€' }[x.currency] || '$';
  const listedPrice = x.price ? `${symbol}${num(x.price)}${p.period ? ' ' + p.period : ''}` : p.main;
  const message = t('l.msg', x.kind, title, listedPrice, objectLink) + `\nID: ${x.id}`;
  const tg = telegramHref(agent.telegram || CONTACT.telegram, message);
  const phone = agent.phone || CONTACT.phone;
  document.title = `${title} · ${p.main} · Homes in Georgia`;

  const factRows = x.kind === 'car' ? [
    ['calendar', t('l.year'), x.year || ''],
    ['car', t('f.body'), x.body ? t('body.' + x.body) : ''],
    ['users', t('l.seats'), x.seats || ''],
    ['pin', t('l.pickup'), x.pickup || ''],
    ['gauge', t('l.mileage'), x.mileage ? `${num(x.mileage)} km` : ''],
    ['sliders', t('f.gearbox'), x.gearbox ? t('gearbox.' + x.gearbox) : ''],
    ['flame', t('f.fuel'), x.fuel ? t('fuel.' + x.fuel) : ''],
  ].filter(r => r[2] !== '') : [
    ['bed', t('l.rooms'), x.rooms != null ? (x.rooms === 0 ? t('f.studio') : x.rooms) : ''],
    ['area', t('l.area'), x.area ? `${num(x.area)} m²` : ''],
    ['layers', t('l.floor'), x.floor ? (x.floors ? `${x.floor} / ${x.floors}` : x.floor) : ''],
    ['home', t('l.kind'), t('kind.' + x.kind) + (x.service === 'commercial' && x.deal ? ' · ' + t('deal.' + x.deal) : '')],
    ['building', t('l.building'), x.building ? t('building.' + x.building) : ''],
    ['brush', t('l.condition'), x.condition ? t('cond.' + x.condition) : ''],
    ['flame', t('l.heating'), x.heating ? t('heat.' + x.heating) : ''],
    ['calendar', t('l.completion'), x.completion || ''],
  ].filter(r => r[2] !== '');

  const terms = [
    ['calendar', t('l.term'), x.months?.length ? t('l.term.value', x.months) : ''],
    ['paw', t('l.pets'), x.pets ? t('pets.' + x.pets) : ''],
    ['users', t('l.tenants'), x.tenants ? t('l.tenants.value', x.tenants) : ''],
    ['key', t('l.deposit'), x.deposit ? `${x.currency === 'GEL' ? '₾' : x.currency === 'EUR' ? '€' : '$'}${num(x.deposit)}` : ''],
  ].filter(r => r[2]);

  const amenities = AMENITY_ORDER.filter(a => x.amenities?.includes(a));
  const gallery = photos.length ? `
    <div class="gallery g${Math.min(photos.length, 5)}">
      ${photos.slice(0, 5).map((src, i) => `<button type="button" class="g-item" data-photo="${i}" aria-label="${esc(title)} · ${i + 1}"><img src="${esc(src)}" alt="" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async"></button>`).join('')}
      ${photos.length > 1 ? `<button type="button" class="btn btn-light g-all" data-photo="0">${icon('image')}<span>${t('l.photos', photos.length)}</span></button>` : ''}
    </div>
    <div class="m-gallery">
      <div class="slides" data-slides>${photos.map((src, i) => `<img src="${esc(src)}" alt="" data-photo="${i}" ${i ? 'loading="lazy"' : ''}>`).join('')}</div>
      <div class="dots" aria-hidden="true">${photos.slice(0, 12).map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div>
    </div>` : '';

  root.innerHTML = `
<article class="listing">
  <div class="container">
    <button type="button" class="l-back" data-back>${icon('left')}<span>${t('nav.back')}</span></button>
    <nav class="crumbs" aria-label="breadcrumbs"><a href="#/">${t('nav.home')}</a>${icon('right')}<a href="#/${x.service}">${t('svc.' + x.service + '.short')}</a>${x.district ? `${icon('right')}<a href="#/${x.service}?district=${encodeURIComponent(x.district)}">${esc(placeName(x.district))}</a>` : ''}</nav>
    <header class="l-head">
      <div>
        <div class="l-badges">
          <span class="badge badge-soft">${icon(svc.icon)}${t('svc.' + x.service + '.short')}</span>
          ${x.exclusive ? `<span class="badge badge-accent">${t('card.exclusive')}</span>` : ''}
        </div>
        <h1>${esc(title)}</h1>
        ${x.kind === 'car' ? '' : `<p class="l-addr">${icon('pin')}${esc([x.title !== title ? x.title : '', placeName(x.district)].filter(Boolean).join(' · ') || t('city'))}${x.metro ? `<span class="metro">${icon('metro')}${esc(placeName(x.metro))}</span>` : ''}</p>`}
      </div>
      <div class="l-actions">
        <button type="button" class="btn btn-outline" data-share>${icon('share')}<span>${t('l.share')}</span></button>
        <button type="button" class="btn btn-outline fav-inline${isFav(x.id) ? ' on' : ''}" data-fav="${esc(x.id)}" data-label aria-pressed="${isFav(x.id)}">${icon('heart')}<span>${t(isFav(x.id) ? 'l.saved' : 'l.save')}</span></button>
      </div>
    </header>
    ${gallery}
    <div class="l-grid">
      <div class="l-main">
        ${factRows.length ? `<section class="l-sec"><h2>${t('l.facts')}</h2><div class="facts">${factRows.map(([ic, k, v]) => `<div class="fact">${icon(ic)}<span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div></section>` : ''}
        ${x.description ? `<section class="l-sec"><h2>${t('l.about')}</h2><p class="l-desc clamp">${esc(x.description).replace(/\n/g, '<br>')}</p>
          <button type="button" class="more-btn" data-expand="desc" hidden>${t('l.more')} ${icon('down')}</button></section>` : ''}
        ${amenities.length ? `<section class="l-sec"><h2>${t('l.amenities')}</h2><ul class="amenities${amenities.length > 8 ? ' clamp' : ''}">${amenities.map(a => `<li>${icon('check')}${t('am.' + a)}</li>`).join('')}</ul>
          ${amenities.length > 8 ? `<button type="button" class="more-btn" data-expand="amen">${t('l.amen.more', amenities.length)} ${icon('down')}</button>` : ''}</section>` : ''}
        ${terms.length ? `<section class="l-sec"><h2>${t('l.terms')}</h2><div class="facts">${terms.map(([ic, k, v]) => `<div class="fact">${icon(ic)}<span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div></section>` : ''}
        ${Number.isFinite(x.lat) ? `<section class="l-sec"><h2>${t('l.location')}</h2><div class="l-map" id="l-map"></div></section>` : ''}
        <p class="l-meta">${t('l.id')}: ${esc(x.id)} · ${t('l.published')}: ${esc(ago(x.published_at))}
          ${x.post_url ? ` · <a href="${esc(x.post_url)}" target="_blank" rel="noopener">${t('l.source')} ${icon('external')}</a>` : ''}</p>
      </div>
      <aside class="l-side">
        <div class="price-card">
          <div class="pc-price"><b>${esc(p.main)}</b>${p.period ? `<span>${p.period}</span>` : ''}</div>
          ${p.approx ? `<p class="pc-approx">${esc(p.approx)} · ${t('l.approx.rate')}</p>` : ''}
          <dl class="pc-rows">
            ${x.deposit ? `<div><dt>${t('l.deposit')}</dt><dd>${esc(terms.find(r => r[0] === 'key')?.[2] || '')}</dd></div>` : ''}
            ${x.ppsqm_usd ? `<div><dt>${t('l.ppsqm')}</dt><dd>${money(x.ppsqm_usd)}</dd></div>` : ''}
          </dl>
          <a class="btn btn-primary btn-lg btn-block" href="${tg}" target="_blank" rel="noopener" data-lead="telegram">${icon('send')}<span>${t('l.write')}</span></a>
          <div class="pc-two">
            <a class="btn btn-outline" href="${phoneHref(phone)}" data-lead="phone">${icon('phone')}<span>${t('l.call')}</span></a>
            <a class="btn btn-outline" href="${whatsappHref(phone, message)}" target="_blank" rel="noopener" data-lead="whatsapp">${icon('whatsapp')}<span>${t('l.whatsapp')}</span></a>
          </div>
          ${agent.telegram ? `<p class="pc-agent">@${esc(agent.telegram)} · ${esc(phone)}</p>` : ''}
        </div>
      </aside>
    </div>
  </div>
  ${rail('rail-similar', t('l.similar'), similar(data, x), '#/' + x.service + (x.district ? '?district=' + encodeURIComponent(x.district) : ''))}
  <div class="l-sticky">
    <div class="ls-price"><b>${esc(p.main)}</b><span>${p.period || '&nbsp;'}</span></div>
    <button type="button" class="icon-btn" data-share aria-label="${esc(t('l.share'))}">${icon('share')}</button>
    ${favButton(x.id, 'fav fav-plain')}
    <a class="btn btn-primary" href="${tg}" target="_blank" rel="noopener" data-lead="telegram">${icon('send')}<span>${t('l.write.short')}</span></a>
  </div>
</article>`;

  root.addEventListener('click', async e => {
    if (e.target.closest('[data-back]')) {
      if (cameFromSite()) history.back();
      else location.hash = '#/' + x.service;
      return;
    }
    // Also copy the link, for Telegram versions that ignore the pre-filled text.
    if (e.target.closest('[data-lead="telegram"]')) {
      navigator.clipboard?.writeText(objectLink).then(() => toast(t('l.msg.copied'))).catch(() => {});
    }
    const more = e.target.closest('[data-expand]');
    if (more) {
      const box = more.previousElementSibling;
      const open = box.classList.toggle('open');
      more.classList.toggle('up', open);
      more.firstChild.textContent = open ? t('l.less') + ' ' : more.dataset.expand === 'amen' ? t('l.amen.more', amenities.length) + ' ' : t('l.more') + ' ';
      return;
    }
    const ph = e.target.closest('[data-photo]');
    if (ph && photos.length) return lightbox(photos, +ph.dataset.photo, title);
    if (e.target.closest('[data-share]')) openShare(x);
  });

  // Show "Show more" only when the description is actually cut.
  const desc = root.querySelector('.l-desc');
  if (desc && desc.scrollHeight > desc.clientHeight + 4) root.querySelector('[data-expand="desc"]').hidden = false;
  else desc?.classList.remove('clamp');

  const mapEl = root.querySelector('#l-map');
  if (mapEl) {
    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const ctl = await createMap(mapEl, { interactive: false, zoom: 15 }).catch(() => null);
      if (ctl) { ctl.update([x], { fit: false }); ctl.map.setView([x.lat, x.lon], 15); }
    }, { root: scrollRoot(), rootMargin: '300px' });
    io.observe(mapEl);
  }
}
