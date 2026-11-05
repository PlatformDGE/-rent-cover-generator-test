// Made with Claude (Anthropic) · © Homes in Georgia · Created by Irakli Kvirkvelia
import { t } from './i18n.js';
import { icon } from './icons.js';
import { serviceOf, FILTER_AMENITIES } from './config.js';
import { esc } from './components.js';
import { placeName } from './places.js';
import { applyFilters, countBy, compactMoney, fromUsd, toUsd, currencySymbol, num, LIST_KEYS, RANGE_KEYS } from './store.js';

const BINS = 36;
const RES = 1000;

/** Square-root scale: fine control at the cheap end where most listings are. */
function scale(min, max) {
  const span = Math.max(1, max - min);
  return {
    toValue: p => min + span * (p / RES) ** 2,
    toPos: v => Math.round(Math.sqrt(Math.min(1, Math.max(0, (v - min) / span))) * RES),
  };
}

function niceStep(v) {
  if (v < 200) return 5;
  if (v < 2000) return 50;
  if (v < 20000) return 500;
  if (v < 200000) return 5000;
  return 10000;
}
const round = v => Math.round(v / niceStep(v)) * niceStep(v);

function percentile(sorted, q) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
}

/**
 * Dual-handle range with a live histogram. Two native range inputs keep
 * keyboard and screen-reader support; the histogram shows where offers are.
 */
function rangeControl(key, values, draft, { money, label, unit: unitLabel = 'm²', plain = false }) {
  const sorted = values.filter(v => v > 0).sort((a, b) => a - b);
  if (sorted.length < 3) return null;
  const min = Math.floor(sorted[0]);
  const max = Math.ceil(percentile(sorted, 0.97));
  const sc = scale(min, max);
  const bins = new Array(BINS).fill(0);
  sorted.forEach(v => { bins[Math.min(BINS - 1, Math.floor((sc.toPos(Math.min(v, max)) / RES) * BINS))]++; });
  const peak = Math.max(...bins);
  const fmt = v => (money ? compactMoney(v) : plain ? String(Math.round(v)) : num(v) + ' ' + unitLabel);
  const unit = money ? currencySymbol() : unitLabel;
  const display = v => (money ? Math.round(fromUsd(v)) : Math.round(v));

  const el = document.createElement('section');
  el.className = 'f-section';
  el.innerHTML = `
    <div class="f-head"><h3>${esc(label)}</h3><output class="f-out"></output></div>
    <div class="range">
      <div class="hist">${bins.map(b => `<i style="height:${Math.max(4, (b / peak) * 100)}%"></i>`).join('')}</div>
      <div class="range-track"><div class="range-fill"></div></div>
      <input type="range" min="0" max="${RES}" step="1" aria-label="${esc(label)} — ${esc(t('f.from'))}">
      <input type="range" min="0" max="${RES}" step="1" aria-label="${esc(label)} — ${esc(t('f.to'))}">
    </div>
    <div class="range-inputs">
      <label><span>${esc(t('f.from'))}, ${unit}</span><input type="number" inputmode="numeric" min="0" placeholder="${display(min)}"></label>
      <i></i>
      <label><span>${esc(t('f.to'))}, ${unit}</span><input type="number" inputmode="numeric" min="0" placeholder="${display(max)}+"></label>
    </div>`;
  const [lo, hi] = el.querySelectorAll('input[type=range]');
  const [nLo, nHi] = el.querySelectorAll('input[type=number]');
  const fill = el.querySelector('.range-fill');
  const out = el.querySelector('.f-out');
  const bars = [...el.querySelectorAll('.hist i')];

  const paint = () => {
    const a = +lo.value, b = +hi.value;
    fill.style.left = (a / RES) * 100 + '%';
    fill.style.right = 100 - (b / RES) * 100 + '%';
    bars.forEach((bar, i) => bar.classList.toggle('in', (i + 0.5) / BINS * RES >= a && (i + 0.5) / BINS * RES <= b));
    const [va, vb] = draft[key];
    out.textContent = va == null && vb == null ? '' : `${va == null ? fmt(min) : fmt(va)} — ${vb == null ? fmt(max) + '+' : fmt(vb)}`;
  };
  const sync = () => {
    const [va, vb] = draft[key];
    lo.value = va == null ? 0 : sc.toPos(va);
    hi.value = vb == null ? RES : sc.toPos(vb);
    nLo.value = va == null ? '' : display(va);
    nHi.value = vb == null ? '' : display(vb);
    paint();
  };
  const fromSlider = () => {
    if (+lo.value > +hi.value - 10) {
      if (document.activeElement === lo) lo.value = +hi.value - 10; else hi.value = +lo.value + 10;
    }
    const snap = plain ? Math.round : round;
    const a = +lo.value <= 0 ? null : snap(sc.toValue(+lo.value));
    const b = +hi.value >= RES ? null : snap(sc.toValue(+hi.value));
    draft[key] = [a, b];
    nLo.value = a == null ? '' : display(a);
    nHi.value = b == null ? '' : display(b);
    paint();
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const fromNumber = () => {
    const parse = input => (input.value === '' ? null : money ? toUsd(+input.value) : +input.value);
    draft[key] = [parse(nLo), parse(nHi)];
    sync();
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  lo.addEventListener('input', fromSlider);
  hi.addEventListener('input', fromSlider);
  nLo.addEventListener('change', fromNumber);
  nHi.addEventListener('change', fromNumber);
  el.reset = sync;
  sync();
  return el;
}

function chipSection(title, key, options, draft, { multi = true, limit = 0 } = {}) {
  if (!options.length) return null;
  const el = document.createElement('section');
  el.className = 'f-section';
  const chips = options.map(([value, text, count], i) =>
    `<button type="button" class="chip${limit && i >= limit ? ' extra' : ''}" data-value="${esc(value)}" aria-pressed="false">${esc(text)}${count != null ? ` <small>${count}</small>` : ''}</button>`).join('');
  el.innerHTML = `<div class="f-head"><h3>${esc(title)}</h3></div><div class="chips${limit ? ' collapsed' : ''}">${chips}</div>
    ${limit && options.length > limit ? `<button type="button" class="more-btn">${esc(t('f.more'))} ${icon('down')}</button>` : ''}`;
  const sync = () => el.querySelectorAll('.chip').forEach(c => {
    const on = multi ? draft[key].includes(c.dataset.value) : draft[key] === c.dataset.value;
    c.classList.toggle('on', on);
    c.setAttribute('aria-pressed', on);
  });
  el.addEventListener('click', e => {
    const more = e.target.closest('.more-btn');
    if (more) {
      const box = el.querySelector('.chips');
      box.classList.toggle('collapsed');
      more.innerHTML = `${esc(t(box.classList.contains('collapsed') ? 'f.more' : 'f.less'))} ${icon('down')}`;
      more.classList.toggle('up', !box.classList.contains('collapsed'));
      return;
    }
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const v = chip.dataset.value;
    if (multi) draft[key] = draft[key].includes(v) ? draft[key].filter(x => x !== v) : [...draft[key], v];
    else draft[key] = draft[key] === v ? '' : v;
    sync();
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  el.reset = sync;
  el.setCounts = counts => el.querySelectorAll('.chip').forEach(c => {
    const n = counts.get(c.dataset.value) || 0;
    const small = c.querySelector('small');
    if (small) small.textContent = n;
    c.classList.toggle('dim', !n && !c.classList.contains('on'));
  });
  sync();
  return el;
}

function toggleSection(title, rows, draft) {
  const el = document.createElement('section');
  el.className = 'f-section';
  el.innerHTML = `<div class="f-head"><h3>${esc(title)}</h3></div>` + rows.map(([key, text]) =>
    `<label class="switch"><span>${esc(text)}</span><input type="checkbox" data-key="${key}"><i></i></label>`).join('');
  el.addEventListener('change', e => { if (e.target.dataset.key) draft[e.target.dataset.key] = e.target.checked; });
  el.reset = () => el.querySelectorAll('input').forEach(i => { i.checked = !!draft[i.dataset.key]; });
  el.reset();
  return el;
}

function selectSection(title, key, options, draft, anyLabel) {
  if (!options.length) return null;
  const el = document.createElement('section');
  el.className = 'f-section';
  el.innerHTML = `<div class="f-head"><h3>${esc(title)}</h3></div><div class="select"><select><option value="">${esc(anyLabel)}</option>${options.map(([v, n]) => `<option value="${esc(v)}">${esc(key === 'metro' || key === 'district' ? placeName(v) : v)} (${n})</option>`).join('')}</select>${icon('down')}</div>`;
  const sel = el.querySelector('select');
  sel.addEventListener('change', () => { draft[key] = sel.value; });
  el.reset = () => { sel.value = draft[key]; };
  el.reset();
  return el;
}

const present = (items, key) => new Set(items.map(x => x[key]).filter(Boolean));

export function buildFilterSections(serviceId, base, draft) {
  const svc = serviceOf(serviceId);
  const want = new Set(svc.filters || []);
  const sections = [];
  const add = (s, key) => { if (s) { s.dataset.key = key; sections.push(s); } };
  const period = base.find(x => x.period)?.period;
  if (want.has('price')) add(rangeControl('price', base.map(x => x.price_usd), draft, { money: true, label: period ? `${t('f.price')} ${t('period.' + period)}` : t('f.price') }), 'price');
  if (want.has('beds')) add(chipSection(t('f.beds'), 'beds', [['0', t('f.studio')], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4+']], draft), 'beds');
  if (want.has('kind')) {
    const kinds = present(base, 'kind');
    add(chipSection(t('f.kind'), 'kind', ['apartment', 'house', 'commercial', 'land'].filter(k => kinds.has(k)).map(k => [k, t('kind.' + k)]), draft), 'kind');
  }
  if (want.has('deal')) {
    const d = present(base, 'deal');
    add(chipSection(t('f.deal'), 'deal', ['rent', 'sale'].filter(k => d.has(k)).map(k => [k, t('deal.' + k)]), draft), 'deal');
  }
  if (want.has('area')) add(rangeControl('area', base.map(x => x.area), draft, { money: false, label: t('f.area') }), 'area');
  if (want.has('year')) add(rangeControl('year', base.map(x => x.year), draft, { money: false, plain: true, unit: '', label: t('f.year') }), 'year');
  if (want.has('mileage')) add(rangeControl('mileage', base.map(x => x.mileage), draft, { money: false, unit: 'km', label: t('f.mileage') }), 'mileage');
  if (want.has('body')) {
    const bd = present(base, 'body');
    add(chipSection(t('f.body'), 'body', ['suv', 'sedan', 'hatchback', 'minivan', 'wagon', 'coupe', 'pickup', 'business'].filter(k => bd.has(k)).map(k => [k, t('body.' + k)]), draft), 'body');
  }
  if (want.has('gearbox')) {
    const g = present(base, 'gearbox');
    add(chipSection(t('f.gearbox'), 'gearbox', ['auto', 'manual'].filter(k => g.has(k)).map(k => [k, t('gearbox.' + k)]), draft), 'gearbox');
  }
  if (want.has('fuel')) {
    const fu = present(base, 'fuel');
    add(chipSection(t('f.fuel'), 'fuel', ['petrol', 'diesel', 'hybrid', 'electric', 'gas'].filter(k => fu.has(k)).map(k => [k, t('fuel.' + k)]), draft), 'fuel');
  }
  let district = null;
  if (want.has('district')) {
    district = chipSection(t('f.district'), 'district', countBy(base, 'district').map(([v, n]) => [v, placeName(v), n]), draft, { limit: 10 });
    add(district, 'district');
  }
  if (want.has('metro')) add(selectSection(t('f.metro'), 'metro', countBy(base, 'metro'), draft, t('f.metro.any')), 'metro');
  if (want.has('building')) {
    const b = present(base, 'building');
    add(chipSection(t('f.building'), 'building', ['new', 'old', 'historical'].filter(k => b.has(k)).map(k => [k, t('building.' + k)]), draft), 'building');
  }
  if (want.has('condition')) {
    const c = present(base, 'condition');
    add(chipSection(t('f.condition'), 'condition', ['renovated', 'mixed', 'white_frame', 'black_frame', 'green_frame', 'under_construction', 'old']
      .filter(k => c.has(k)).map(k => [k, t('cond.' + k)]), draft), 'condition');
  }
  if (want.has('heating')) {
    const h = present(base, 'heating');
    add(chipSection(t('l.heating'), 'heating', ['central', 'gas', 'electric'].filter(k => h.has(k)).map(k => [k, t('heat.' + k)]), draft), 'heating');
  }
  if (want.has('amenities')) add(chipSection(t('f.amenities'), 'amen', FILTER_AMENITIES.map(k => [k, t('am.' + k)]), draft), 'amen');
  if (want.has('term')) add(chipSection(t('f.term'), 'term', [['short', t('term.short')], ['year', t('term.year')], ['long', t('term.long')]], draft, { multi: false }), 'term');
  const flags = [];
  if (want.has('pets')) flags.push(['pets', t('f.pets')]);
  if (want.has('flags')) flags.push(['excl', t('f.exclusive')]);
  if (flags.length) add(toggleSection(t('f.flags'), flags, draft), 'flags');
  return { sections, district };
}

export function clearFilter(f, key) {
  if (LIST_KEYS.includes(key)) f[key] = [];
  else if (RANGE_KEYS.includes(key)) f[key] = [null, null];
  else if (key === 'flags') f.pets = f.excl = false;
  else f[key] = '';
}

/**
 * All filters: bottom sheet on phones, side panel on desktop.
 * One filter (`only`): a small popover under its pill button on desktop,
 * a short bottom sheet on phones.
 */
export function openFilterSheet({ serviceId, base, filters, onApply, only = '', anchor = null }) {
  const draft = structuredClone(filters);
  const popover = !!(only && anchor && matchMedia('(min-width: 760px)').matches);
  const { sections, district } = buildFilterSections(serviceId, base, draft);
  const shown = only ? sections.filter(s => s.dataset.key === only) : sections;
  const title = only ? shown[0]?.querySelector('h3')?.textContent || t('f.title') : t('f.title');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap' + (popover ? ' pop' : '') + (only ? ' single' : '');
  wrap.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <aside class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <header class="sheet-head"><span class="grab"></span><h2 id="sheet-title">${esc(title)}</h2>
        <button class="icon-btn" type="button" data-close aria-label="${esc(t('nav.close'))}">${icon('x')}</button></header>
      <div class="sheet-body"></div>
      <footer class="sheet-foot"><button type="button" class="btn btn-ghost" data-reset>${esc(t(only ? 'f.clear' : 'cat.reset'))}</button>
        <button type="button" class="btn btn-primary" data-apply></button></footer>
    </aside>`;
  const body = wrap.querySelector('.sheet-body');
  shown.forEach(s => body.append(s));
  const applyBtn = wrap.querySelector('[data-apply]');
  const recount = () => {
    applyBtn.textContent = t('f.show', applyFilters(base, draft).length);
    district?.setCounts(new Map(countBy(applyFilters(base, draft, 'district'), 'district')));
  };
  body.addEventListener('change', recount);
  recount();

  if (popover) {
    const r = anchor.getBoundingClientRect();
    const sheet = wrap.querySelector('.sheet');
    sheet.style.top = Math.round(r.bottom + 8) + 'px';
    sheet.style.left = Math.round(Math.min(r.left, window.innerWidth - 400)) + 'px';
  }

  const close = () => {
    wrap.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('locked');
    setTimeout(() => wrap.remove(), 220);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) close();
    if (e.target.closest('[data-reset]')) {
      if (only) {
        clearFilter(draft, only);
      } else {
        LIST_KEYS.forEach(k => { draft[k] = []; });
        RANGE_KEYS.forEach(k => { draft[k] = [null, null]; });
        draft.metro = ''; draft.term = ''; draft.pets = draft.excl = false;
      }
      sections.forEach(s => s.reset?.());
      recount();
    }
    if (e.target.closest('[data-apply]')) { onApply(draft); close(); }
  });
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  if (!popover) document.body.classList.add('locked');
  requestAnimationFrame(() => { wrap.classList.add('open'); wrap.querySelector('.sheet-head .icon-btn').focus({ preventScroll: true }); });
}
