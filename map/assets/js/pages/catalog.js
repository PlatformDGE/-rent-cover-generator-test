// Made with Claude (Anthropic) · © Homes in Georgia · Created by Irakli Kvirkvelia
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { GROUPS, SERVICES, serviceOf } from '../config.js';
import { esc, card, empty, skeletons } from '../components.js';
import { openFilterSheet } from '../filters.js';
import { placeName } from '../places.js';
import { createMap } from '../map.js';
import { replaceHash, pushHash, setPageTop, scrollRoot } from '../scroll.js';
import {
  itemsFor, parseFilters, filtersToParams, applyFilters, sortItems, activeCount, compactMoney, num, RANGE_KEYS,
} from '../store.js';

const PAGE = 24;
const desktop = () => matchMedia('(min-width: 1100px)').matches;

export function renderCatalog(root, data, serviceId, params) {
  const svc = serviceOf(serviceId);
  const group = svc.group;
  const base = itemsFor(data, serviceId);
  let f = parseFilters(params);
  const defaultView = () => (base.some(x => Number.isFinite(x.lat)) && desktop() ? 'map' : 'list');
  let view = params.get('view') || defaultView();
  // Below the desktop split view the map is always the main full-screen map,
  // showing exactly what the current filters found.
  const mainMapHash = () => {
    const q = filtersToParams(f);
    q.set('from', serviceId);
    return '#/map?' + q;
  };
  if (view === 'map' && !desktop()) {
    location.replace(mainMapHash());
    return {};
  }
  let rows = [], shown = 0, mapCtl = null, mapReady = null;

  const tabs = serviceId === 'all'
    ? Object.keys(SERVICES).filter(s => SERVICES[s].live && SERVICES[s].group === 'realty')
    : GROUPS[group].services;
  const isCar = group === 'auto';
  const sortOptions = ['new', 'cheap', 'expensive',
    ...(isCar ? ['year'] : ['area']),
    ...(base.some(x => x.ppsqm_usd) ? ['ppsqm'] : [])];
  const hasMap = base.some(x => Number.isFinite(x.lat));
  // The most used filters get their own pill button; the rest live under "Filters".
  const pills = ['price', 'beds', 'deal', 'district', 'body', 'year', 'gearbox']
    .filter(k => (svc.filters || []).includes(k)).slice(0, 3);

  root.innerHTML = `
<section class="catalog">
  <div class="container cat-top">
    <div class="cat-title"><h1>${t('svc.' + serviceId)}</h1><span class="cat-count" aria-live="polite"></span></div>
    <div class="svc-tabs" role="tablist">
      ${tabs.map(s => `<a role="tab" class="svc-tab${s === serviceId ? ' on' : ''}" href="#/${s}" aria-selected="${s === serviceId}">${icon(SERVICES[s].icon)}${t('svc.' + s + '.short')}${SERVICES[s].live ? '' : `<sup>${t('svc.soon')}</sup>`}</a>`).join('')}
    </div>
  </div>
  <div class="toolbar-wrap">
    <div class="container toolbar">
      <label class="search">${icon('search')}<input type="search" value="${esc(f.q)}" placeholder="${esc(t(isCar ? 'cat.search.car' : 'cat.search'))}" aria-label="${esc(t(isCar ? 'cat.search.car' : 'cat.search'))}"></label>
      <div class="pills" role="group" aria-label="${esc(t('cat.filters'))}">
        <button type="button" class="pill filters-btn" aria-label="${esc(t('cat.filters.all'))}">${icon('sliders')}<span>${t('cat.filters')}</span><b class="nbadge"></b></button>
        ${pills.map(k => `<button type="button" class="pill" data-pill="${k}"><span></span>${icon('down')}</button>`).join('')}
        <div class="select sort pill-select">${icon('down')}<select aria-label="${esc(t('cat.sort'))}">
          ${sortOptions.map(s => `<option value="${s}">${t('cat.sort.' + s)}</option>`).join('')}
        </select></div>
      </div>
      <div class="view-toggle" role="group"${hasMap ? '' : ' hidden'}>
        <button type="button" data-setview="list" aria-label="${esc(t('cat.view.list'))}">${icon('list')}<span>${t('cat.view.list')}</span></button>
        <button type="button" data-setview="map" aria-label="${esc(t('cat.view.map'))}">${icon('map')}<span>${t('cat.view.map')}</span></button>
      </div>
    </div>
  </div>
  <div class="container active-row" hidden></div>
  <div class="cat-body">
    <div class="results"><div class="grid">${skeletons(6)}</div><div class="sentinel"></div></div>
    <div class="map-pane"><div class="map" id="cat-map"></div><div class="map-note"></div><div class="map-peek" hidden></div></div>
  </div>
  ${hasMap ? '<button type="button" class="fab-view"></button>' : ''}
</section>`;

  const $ = s => root.querySelector(s);
  const grid = $('.grid'), search = $('.search input'), sort = $('.sort select');
  sort.value = f.sort;

  function commit(next, { replace = true } = {}) {
    f = next;
    const qp = filtersToParams(f);
    if (view !== defaultView()) qp.set('view', view);
    const hash = `#/${serviceId}${qp.toString() ? '?' + qp : ''}`;
    if (location.hash !== hash) (replace ? replaceHash : pushHash)(hash);
    render();
  }

  function activeChips() {
    const chips = [];
    const add = (label, fn) => chips.push({ label, fn });
    const span = ([a, b], fmt) => (a != null && b != null ? `${fmt(a)} — ${fmt(b)}` : a != null ? `${t('f.from')} ${fmt(a)}` : `${t('f.to')} ${fmt(b)}`);
    if (f.price[0] != null || f.price[1] != null) add(span(f.price, compactMoney), x => { x.price = [null, null]; });
    if (f.area[0] != null || f.area[1] != null) add(span(f.area, v => `${Math.round(v)} m²`), x => { x.area = [null, null]; });
    if (f.year[0] != null || f.year[1] != null) add(span(f.year, v => String(Math.round(v))), x => { x.year = [null, null]; });
    if (f.mileage[0] != null || f.mileage[1] != null) add(span(f.mileage, v => `${num(v)} km`), x => { x.mileage = [null, null]; });
    f.deal.forEach(k => add(t('deal.' + k), x => { x.deal = x.deal.filter(v => v !== k); }));
    f.gearbox.forEach(k => add(t('gearbox.' + k), x => { x.gearbox = x.gearbox.filter(v => v !== k); }));
    f.fuel.forEach(k => add(t('fuel.' + k), x => { x.fuel = x.fuel.filter(v => v !== k); }));
    f.body.forEach(k => add(t('body.' + k), x => { x.body = x.body.filter(v => v !== k); }));
    f.beds.forEach(b => add(b === '0' ? t('f.studio') : t('card.beds', +b) + (b === '4' ? '+' : ''), x => { x.beds = x.beds.filter(v => v !== b); }));
    f.kind.forEach(k => add(t('kind.' + k), x => { x.kind = x.kind.filter(v => v !== k); }));
    f.district.forEach(d => add(placeName(d), x => { x.district = x.district.filter(v => v !== d); }));
    if (f.metro) add(placeName(f.metro), x => { x.metro = ''; });
    f.building.forEach(k => add(t('building.' + k), x => { x.building = x.building.filter(v => v !== k); }));
    f.condition.forEach(k => add(t('cond.' + k), x => { x.condition = x.condition.filter(v => v !== k); }));
    f.heating.forEach(k => add(t('heat.' + k), x => { x.heating = x.heating.filter(v => v !== k); }));
    f.amen.forEach(k => add(t('am.' + k), x => { x.amen = x.amen.filter(v => v !== k); }));
    if (f.term) add(t('term.' + f.term), x => { x.term = ''; });
    if (f.pets) add(t('f.pets'), x => { x.pets = false; });
    if (f.excl) add(t('f.exclusive'), x => { x.excl = false; });
    return chips;
  }

  function pillLabel(k) {
    const range = (v, fmt) => (v[0] != null && v[1] != null ? `${fmt(v[0])}–${fmt(v[1])}` : v[0] != null ? `${t('f.from')} ${fmt(v[0])}` : `${t('f.to')} ${fmt(v[1])}`);
    const list = (vals, fmt) => (vals.length > 2 ? `${fmt(vals[0])} +${vals.length - 1}` : vals.map(fmt).join(', '));
    const set = Array.isArray(f[k]) && (RANGE_KEYS.includes(k) ? f[k].some(v => v != null) : f[k].length);
    if (!set) return [t(k === 'price' ? 'f.price' : k === 'beds' ? 'f.beds' : 'f.' + k), false];
    if (k === 'price') return [range(f.price, compactMoney), true];
    if (k === 'year') return [range(f.year, v => Math.round(v)), true];
    if (k === 'beds') return [list([...f.beds].sort(), b => (b === '0' ? t('f.studio') : b === '4' ? '4+' : b)) + ' ' + t('f.beds.short'), true];
    if (k === 'deal') return [list(f.deal, v => t('deal.' + v)), true];
    if (k === 'gearbox') return [list(f.gearbox, v => t('gearbox.' + v)), true];
    if (k === 'body') return [list(f.body, v => t('body.' + v)), true];
    return [list(f[k], v => v), true];
  }

  function renderChrome() {
    const n = activeCount(f);
    $('.nbadge').textContent = n || '';
    $('.filters-btn').classList.toggle('on', n > 0);
    root.querySelectorAll('[data-pill]').forEach(b => {
      const [label, on] = pillLabel(b.dataset.pill);
      b.querySelector('span').textContent = label;
      b.classList.toggle('on', on);
    });
    const chips = activeChips();
    const row = $('.active-row');
    row.hidden = !chips.length;
    row.innerHTML = chips.map((c, i) => `<button type="button" class="chip on removable" data-chip="${i}">${esc(c.label)}${icon('x')}</button>`).join('')
      + (chips.length ? `<button type="button" class="link-btn" data-clear>${t('cat.reset')}</button>` : '');
    row._chips = chips;
    const section = $('.catalog');
    section.dataset.view = view;
    root.querySelectorAll('[data-setview]').forEach(b => b.classList.toggle('on', b.dataset.setview === view));
    if ($('.fab-view')) $('.fab-view').innerHTML = view === 'map' ? `${icon('list')}<span>${t('cat.view.list')}</span>` : `${icon('map')}<span>${t('cat.view.map')}</span>`;
  }

  // "Nothing found": offer to drop the single filter that brings back the most offers.
  function suggestions() {
    const chips = activeChips();
    const options = chips.map((c, i) => {
      const next = structuredClone(f);
      c.fn(next);
      return { i, label: c.label, n: applyFilters(base, next).length };
    }).filter(o => o.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);
    if (f.q && applyFilters(base, { ...f, q: '' }).length) options.unshift({ i: 'q', label: `«${f.q}»`, n: applyFilters(base, { ...f, q: '' }).length });
    return `<div class="suggest">${options.map(o => `<button type="button" class="chip" data-suggest="${o.i}">${icon('x')}${esc(t('cat.drop', o.label, o.n))}</button>`).join('')}
      ${activeCount(f) || f.q ? `<button type="button" class="btn btn-primary" data-clear>${t('cat.reset')}</button>` : ''}</div>`;
  }

  function page() {
    const next = rows.slice(shown, shown + PAGE);
    grid.insertAdjacentHTML('beforeend', next.map((x, i) => card(x, { eager: shown === 0 && i < 2 })).join(''));
    shown += next.length;
  }

  function render() {
    rows = sortItems(applyFilters(base, f), f.sort);
    $('.cat-count').textContent = t('cat.count', rows.length);
    renderChrome();
    shown = 0;
    grid.innerHTML = '';
    if (!rows.length) {
      grid.innerHTML = empty(t('cat.empty.t'), t('cat.empty.d'), suggestions());
    } else page();
    if (view === 'map') ensureMap().then(() => syncMap());
  }

  function syncMap(fit = true) {
    if (!mapCtl) return;
    const placed = mapCtl.update(rows, { fit });
    const missing = rows.length - placed;
    $('.map-note').textContent = missing > 0 ? `${num(missing)} ${t('cat.no.coords')}` : '';
    $('.map-note').hidden = missing <= 0;
  }

  // Phones: tapping a price pin shows that listing as a card at the bottom of the map.
  function peek(x) {
    const box = $('.map-peek');
    box.innerHTML = x ? card(x) : '';
    box.hidden = !x;
    $('.catalog').classList.toggle('peeking', !!x);
  }

  function ensureMap() {
    mapReady ??= createMap($('#cat-map'), { onSelect: desktop() ? null : peek }).then(ctl => { mapCtl = ctl; return ctl; }).catch(() => null);
    return mapReady.then(ctl => { ctl?.invalidate(); return ctl; });
  }

  // ---- events ----
  let typing;
  search.addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(() => commit({ ...f, q: search.value }), 180);
  });
  sort.addEventListener('change', () => commit({ ...f, sort: sort.value }));
  root.addEventListener('click', e => {
    const pill = e.target.closest('[data-pill]');
    if (pill) {
      return openFilterSheet({ serviceId, base, filters: f, only: pill.dataset.pill, anchor: pill, onApply: next => commit(next, { replace: false }) });
    }
    if (e.target.closest('.filters-btn')) {
      return openFilterSheet({ serviceId, base, filters: f, onApply: next => commit(next, { replace: false }) });
    }
    const sug = e.target.closest('[data-suggest]');
    if (sug) {
      if (sug.dataset.suggest === 'q') { search.value = ''; return commit({ ...f, q: '' }); }
      const next = structuredClone(f);
      activeChips()[+sug.dataset.suggest].fn(next);
      return commit(next);
    }
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      const next = structuredClone(f);
      $('.active-row')._chips[+chip.dataset.chip].fn(next);
      return commit(next);
    }
    if (e.target.closest('[data-clear]')) {
      search.value = '';
      return commit(parseFilters(new URLSearchParams(f.sort !== 'new' ? 'sort=' + f.sort : '')));
    }
    const v = e.target.closest('[data-setview]');
    const fab = e.target.closest('.fab-view');
    if (fab && view !== 'map') {
      location.hash = mainMapHash();
      return;
    }
    if (v || fab) {
      view = v ? v.dataset.setview : view === 'map' ? 'list' : 'map';
      commit(f);
      if (view === 'list' && !desktop()) setPageTop(0);
    }
  });

  // List ⇄ map hover sync (desktop split view).
  grid.addEventListener('pointerover', e => {
    const c = e.target.closest('.card');
    if (c && mapCtl && c !== grid._hot) {
      if (grid._hot) mapCtl.highlight(grid._hot.dataset.id, false);
      grid._hot = c;
      mapCtl.highlight(c.dataset.id, true);
    }
  });
  grid.addEventListener('pointerleave', () => {
    if (grid._hot && mapCtl) mapCtl.highlight(grid._hot.dataset.id, false);
    grid._hot = null;
  });

  const io = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting) && shown < rows.length) page();
  }, { root: scrollRoot(), rootMargin: '900px 0px' });
  io.observe($('.sentinel'));

  render();
  $('.pills').scrollLeft = 0;

  return {
    // Called by the router when only the query changed (back/forward).
    update(nextParams) {
      f = parseFilters(nextParams);
      view = nextParams.get('view') || defaultView();
      if (view === 'map' && !desktop()) {
        location.replace(mainMapHash());
        return;
      }
      search.value = f.q;
      sort.value = f.sort;
      render();
    },
    destroy() { io.disconnect(); mapCtl?.destroy(); },
  };
}
