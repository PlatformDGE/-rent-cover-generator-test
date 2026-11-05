// Made with Claude (Anthropic) · © Homes in Georgia · Created by Irakli Kvirkvelia
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { MAP_CENTER, MAP_CHANNELS, KIND_ICONS, CHANNELS, FRESHNESS, SERVICES, CONTACT, channelOf, freshnessOf, telegramHref } from '../config.js';
import { esc, listingTitle, facts } from '../components.js';
import { placeName } from '../places.js';
import { loadLeaflet, mapTiler } from '../map.js';
import { entryData, saveEntry, replaceHash } from '../scroll.js';
import { num, compactMoney, priceLabel, ago, itemsFor, parseFilters, applyFilters, activeCount } from '../store.js';

const desktop = () => matchMedia('(min-width: 900px)').matches;
const hasPoint = x => Number.isFinite(x.lat) && Number.isFinite(x.lon);
const csv = v => new Set((v || '').split(',').filter(Boolean));

/**
 * Total map of every listing.
 * One switch per Telegram channel; icon = the post's hashtag (#Apartment, #House,
 * #Commercial, #Land, car); colour = how fresh the post is (green < 5 days,
 * amber 5–20, red-orange > 20). State lives in the URL: #/map?ch=…&age=…
 * list what is switched OFF.
 */
// Phones: a double tap on the map zooms in one step towards the tapped point.
// Taps on pins, clusters and map controls keep their own behaviour.
function doubleTapZoom(L, map) {
  const el = map.getContainer();
  let lastTime = 0, lastX = 0, lastY = 0, startX = 0, startY = 0, single = false;
  el.addEventListener('touchstart', e => {
    single = e.touches.length === 1;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    const p = e.touches[0];
    if (e.touches.length > 1 || Math.hypot(p.clientX - startX, p.clientY - startY) > 10) single = false;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    const p = e.changedTouches[0];
    if (!single || e.touches.length || e.target.closest('.leaflet-marker-icon, .leaflet-control')) { lastTime = 0; return; }
    const now = Date.now();
    if (now - lastTime < 350 && Math.hypot(p.clientX - lastX, p.clientY - lastY) < 30) {
      e.preventDefault();
      lastTime = 0;
      map.setZoomAround(L.DomEvent.getMousePosition(p, el), map.getZoom() + 1);
    } else {
      lastTime = now;
      lastX = p.clientX;
      lastY = p.clientY;
    }
  }, { passive: false });
}

// opts.standalone: the map at hge.ge/map/ — filters come from the page address (?price=…&district=…),
// opts.onState(query) stores the new state there, opts.onReset() clears the filters.
export function renderMap(root, data, params, opts = {}) {
  const standalone = !!opts.standalone;
  // #/map?from=<service>&<catalog filters>: only what that search found.
  const from = params.get('from');
  const scoped = !standalone && (from === 'all' || !!SERVICES[from]);
  const filtered = standalone && (activeCount(parseFilters(params)) > 0 || !!params.get('q'));
  const source = standalone ? applyFilters(data.items, parseFilters(params)) : scoped ? applyFilters(itemsFor(data, from), parseFilters(params)) : data.items;
  // Listings without coordinates stay in the catalogue; the map says how many are not shown.
  const noPoint = source.filter(x => !hasPoint(x));
  const all = source.filter(hasPoint).map(x => ({ x, ch: channelOf(x), kind: KIND_ICONS[x.kind] ? x.kind : 'apartment', fresh: freshnessOf(x) }));
  const count = { ch: {}, age: {} };
  all.forEach(p => {
    count.ch[p.ch] = (count.ch[p.ch] || 0) + 1;
    count.age[p.fresh.id] = (count.age[p.fresh.id] || 0) + 1;
  });
  const off = { ch: csv(params.get('ch')), age: csv(params.get('age')) };
  const visible = () => all.filter(p => !off.ch.has(p.ch) && !off.age.has(p.fresh.id));

  document.body.classList.add('map-page');
  root.innerHTML = `
<section class="mapapp">
  <h1 class="sr-only">${t('map.title')}</h1>
  <div class="tmap" id="tmap"></div>
  <aside class="mlayers" aria-label="${esc(t('map.title'))}"></aside>
  <div class="mchips" role="group" aria-label="${esc(t('map.channels'))}"></div>
  <div class="mages" role="group" aria-label="${esc(t('map.freshness'))}"></div>
  <div class="mfound"${scoped || filtered ? '' : ' hidden'}></div>
  <div class="mpeek" hidden></div>
</section>`;
  const $ = s => root.querySelector(s);

  const row = (group, id, ic) => {
    const n = count[group][id] || 0;
    if ((scoped || filtered) && !n) return '';
    const on = !off[group].has(id);
    return `<button type="button" class="lrow${on && n ? ' on' : ''}${n ? '' : ' empty'}" data-group="${group}" data-id="${id}" ${n ? '' : 'disabled'} aria-pressed="${on}" title="@${esc(CHANNELS[id] || '')}">
      <i>${icon(ic)}</i><b>${t(`map.${group}.${id}`)}</b><small>${n || t('svc.soon')}</small><span class="sw"></span></button>`;
  };
  const ageButton = f => `<button type="button" class="age${off.age.has(f.id) ? '' : ' on'}" data-group="age" data-id="${f.id}" style="--c:${f.color}" aria-pressed="${!off.age.has(f.id)}">
      <i></i><span>${t('map.age.' + f.id)}</span><small>${count.age[f.id] || 0}</small></button>`;
  const chip = (group, id, ic) => `<button type="button" class="mchip${off[group].has(id) ? ' off' : ''}" data-group="${group}" data-id="${id}" aria-pressed="${!off[group].has(id)}"><i>${icon(ic)}</i>${t(`map.${group}.${id}`)}</button>`;

  function controls() {
    const n = visible().length;
    $('.mlayers').innerHTML = `
      <h2>${t('map.title')}</h2><p>${t('map.count', n)}</p>${noPoint.length ? `<p class="map-nocoords">${t('map.nocoords', noPoint.length)} <a href="#/${scoped ? from : 'all'}">${t('map.nocoords.link')}</a></p>` : ''}${standalone ? `<button type="button" class="btn btn-primary btn-block mlayers-filter" data-open-filters>${icon('sliders')}<span>${t('f.title')}</span></button>` : ''}
      <h3>${t('map.channels')}</h3><div class="lgroup">${MAP_CHANNELS.map(c => row('ch', c.id, c.icon)).join('')}</div>
      <div class="kinds-legend">${['apartment', 'house', 'commercial', 'land'].map(k => `<span><i>${icon(KIND_ICONS[k])}</i>${t('map.kind.' + k)}</span>`).join('')}</div>
      <h3>${t('map.freshness')}</h3><div class="ages">${FRESHNESS.map(ageButton).join('')}</div>
      <div class="lfoot"><button type="button" class="btn btn-outline" data-all="1">${t('map.show.all')}</button><button type="button" class="btn btn-outline" data-all="0">${t('map.hide.all')}</button></div>`;
    // Phones: channels on the first row, freshness on the second.
    $('.mchips').innerHTML = `<button type="button" class="mchip all" data-all="1">${t('map.all')} · ${n}</button>`
      + MAP_CHANNELS.filter(c => count.ch[c.id]).map(c => chip('ch', c.id, c.icon)).join('');
    $('.mages').innerHTML = FRESHNESS.map(ageButton).join('');
    if (filtered) {
      const list = new URLSearchParams(params);
      ['ch', 'age'].forEach(k => list.delete(k));
      const missing = source.length - all.length;
      $('.mfound').innerHTML = `<a class="mfound-list" href="#/all${list.toString() ? '?' + list : ''}">${icon('list')}<span>${t('cat.view.list')}</span></a>
        <b>${esc(t('map.found', n))}${missing > 0 ? `<small>${num(missing)} ${esc(t('cat.no.coords'))}</small>` : ''}</b>
        <button type="button" class="mfound-x" data-reset-filters aria-label="${esc(t('cat.reset'))}" title="${esc(t('cat.reset'))}">${icon('x')}</button>`;
    }
    if (scoped) {
      const list = new URLSearchParams(params);
      ['from', 'ch', 'age'].forEach(k => list.delete(k));
      const missing = source.length - all.length;
      $('.mfound').innerHTML = `<a class="mfound-list" href="#/${from}${list.toString() ? '?' + list : ''}">${icon('list')}<span>${t('cat.view.list')}</span></a>
        <b>${esc(t('map.found', n))}${missing > 0 ? `<small>${num(missing)} ${esc(t('cat.no.coords'))}</small>` : ''}</b>
        <a class="mfound-x" href="#/map" aria-label="${esc(t('map.found.clear'))}" title="${esc(t('map.found.clear'))}">${icon('x')}</a>`;
    }
  }

  let L, map, layer;
  function draw() {
    if (!layer) return;
    layer.clearLayers();
    visible().forEach(p => {
      const { x, fresh } = p;
      const period = x.period ? t('period.' + x.period).replace(/\s+/g, '') : '';
      const m = L.marker([x.lat, x.lon], {
        fresh: fresh.id, keyboard: true, title: listingTitle(x),
        icon: L.divIcon({ className: 'cm', iconSize: null,
          html: `<div style="--c:${fresh.color}"><i>${icon(KIND_ICONS[p.kind])}</i>${x.price_usd ? esc(compactMoney(x.price_usd)) + (period ? `<small>${esc(period)}</small>` : '') : ''}</div>` }),
      });
      m.on('click', () => select(p));
      layer.addLayer(m);
    });
  }

  function select({ x, ch, kind, fresh }) {
    saveEntry({ card: x.id });
    const pr = priceLabel(x);
    const body = `
      ${x.photos?.[0] ? `<img src="${esc(x.photos[0])}" alt="">` : ''}
      <div><em style="--c:${fresh.color}"><i></i>${t('map.ch.' + ch)} · ${t(kind === 'car' ? 'kind.car' : 'map.kind.' + kind)} · ${esc(ago(x.published_at))}</em>
        <b>${esc(pr.main)} <small>${pr.period}</small></b><span>${esc(listingTitle(x))}</span><small>${esc(facts(x).join(' · '))}</small></div>`;
    // Standalone map: "Details" opens the listing on the site, Telegram writes to the agent with the listing ID.
    const actions = standalone ? `<div class="tm-actions"><a class="btn btn-outline" href="#/listing/${esc(x.id)}">${t('map.details')}</a><a class="btn btn-primary" href="${esc(telegramHref(x.agent?.telegram || CONTACT.telegram, t('l.msg', x.kind, listingTitle(x), pr.main + (pr.period ? ' ' + pr.period : ''), x.post_url || location.origin + '/#/listing/' + x.id) + `\nID: ${x.id}`))}" target="_blank" rel="noopener" data-lead="telegram">${icon('send')}<span>Telegram</span></a></div>` : '';
    if (desktop()) {
      L.popup({ className: 'pop', closeButton: false, offset: [0, -12], maxWidth: 280, autoPanPaddingTopLeft: [340, 24], autoPanPaddingBottomRight: [24, 24] })
        .setLatLng([x.lat, x.lon]).setContent(`<div class="tm-wrap"><a class="map-card tm-card" href="#/listing/${esc(x.id)}">${body}</a>${actions}</div>`).openOn(map);
    } else {
      const peek = $('.mpeek');
      peek.innerHTML = `<div class="tm-wrap"><a class="tm-peek" href="#/listing/${esc(x.id)}">${body}</a>${actions}</div>`;
      peek.hidden = false;
      $('.mapapp').classList.add('peeking');
    }
  }

  function commit() {
    const q = new URLSearchParams(scoped || standalone ? params : '');
    q.delete('ch');
    q.delete('age');
    Object.entries(off).forEach(([k, set]) => { if (set.size) q.set(k, [...set].join(',')); });
    if (standalone) opts.onState?.(q);
    else replaceHash('#/map' + (q.toString() ? '?' + q : ''));
    controls();
    draw();
  }

  root.addEventListener('click', e => {
    const b = e.target.closest('[data-group]');
    const all = e.target.closest('[data-all]');
    if (b) {
      const set = off[b.dataset.group];
      set.has(b.dataset.id) ? set.delete(b.dataset.id) : set.add(b.dataset.id);
      commit();
    }
    if (standalone && e.target.closest('[data-open-filters]')) return opts.onFilters?.();
    if (standalone && e.target.closest('[data-reset-filters]')) return opts.onReset?.();
    if (all) {
      Object.values(off).forEach(set => set.clear());
      if (all.dataset.all === '0') MAP_CHANNELS.forEach(c => off.ch.add(c.id));
      commit();
    }
  });

  controls();
  let sizeWatch = null;
  loadLeaflet().then(lib => {
    if (!root.isConnected) return;
    L = lib;
    // Coming back from a listing: same place, same zoom, same open card.
    const saved = entryData();
    map = L.map($('#tmap'), { zoomControl: false, doubleClickZoom: !L.Browser.mobile }).setView(saved.center || MAP_CENTER, saved.zoom ?? (desktop() ? 13 : 12));
    map.on('moveend', () => { const c = map.getCenter(); saveEntry({ center: [c.lat, c.lng], zoom: map.getZoom() }); });
    sizeWatch = new ResizeObserver(() => map.invalidateSize());
    sizeWatch.observe($('#tmap'));
    if (L.Browser.mobile) doubleTapZoom(L, map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.attributionControl.setPrefix(false);
    const streets = mapTiler(L, 'streets-v2').addTo(map);
    L.control.layers({ [t('map.streets')]: streets, [t('map.satellite')]: mapTiler(L, 'hybrid', 'jpg') }, null, { position: desktop() ? 'topright' : 'bottomright' }).addTo(map);
    map.on('click', () => { saveEntry({ card: null }); $('.mpeek').hidden = true; $('.mapapp').classList.remove('peeking'); });
    // Cluster ring shows the freshness mix of the listings inside it.
    layer = L.markerClusterGroup({
      maxClusterRadius: 52, showCoverageOnHover: false,
      iconCreateFunction(cl) {
        const by = {};
        cl.getAllChildMarkers().forEach(m => { by[m.options.fresh] = (by[m.options.fresh] || 0) + 1; });
        const n = cl.getChildCount();
        let acc = 0;
        const stops = FRESHNESS.filter(f => by[f.id]).map(f => { const a = acc; acc += (by[f.id] / n) * 360; return `${f.color} ${a}deg ${acc}deg`; });
        return L.divIcon({ className: 'dc', html: `<div style="--g:conic-gradient(${stops.join(',')})"><span>${n}</span></div>`, iconSize: [46, 46] });
      },
    }).addTo(map);
    draw();
    if (saved.card) {
      const p = all.find(q => q.x.id === saved.card);
      if (p) select(p);
    } else if ((scoped || filtered) && all.length && !saved.center) {
      map.fitBounds(L.latLngBounds(all.map(p => [p.x.lat, p.x.lon])), {
        paddingTopLeft: desktop() ? [340, 80] : [36, 170], paddingBottomRight: [36, 36], maxZoom: 15, animate: false,
      });
    }
  }).catch(() => {});

  return { destroy() { document.body.classList.remove('map-page'); sizeWatch?.disconnect(); map?.remove(); } };
}
