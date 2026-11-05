// Made with Claude (Anthropic) · © Homes in Georgia · Created by Irakli Kvirkvelia
// Standalone map at hge.ge/map/ — full screen, no site header. The state lives in
// the address (?price=-1000&district=Vake&ch=…), so any filtered view is a link
// that can be sent to a client. "Details" opens the listing on the main site.
import { t, getLang, setLang, languages } from './i18n.js';
import { icon, logo } from './icons.js';
import { markLive } from './config.js';
import { esc, installInteractions, loadingView, errorView } from './components.js';
import { loadFeed, setRates, parseFilters, filtersToParams, activeCount } from './store.js';
import { openFilterSheet } from './filters.js';
import { enterEntry } from './scroll.js';
import { renderMap } from './pages/map.js';

const bar = document.getElementById('mbar');
const main = document.getElementById('main');
let data = null, page = null;

const params = () => new URLSearchParams(location.search);
const FILTER_STATE = ['ch', 'age']; // map switches that are not catalogue filters

function writeState(q) {
  history.replaceState(history.state, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  renderBar();
}

function renderBar() {
  const n = activeCount(parseFilters(params())) + (params().get('q') ? 1 : 0);
  bar.innerHTML = `
    <a class="brand" href="./" aria-label="Homes in Georgia">${logo()}</a>
    <button type="button" class="btn btn-light mbar-filter" data-open-filters>${icon('sliders')}<span>${esc(t('f.title'))}</span>${n ? `<b class="nbadge">${n}</b>` : ''}</button>
    <div class="lang-seg" role="radiogroup" aria-label="Language" style="--i:${languages.indexOf(getLang())}">
      <i class="lang-thumb" aria-hidden="true"></i>
      ${languages.map(l => `<button type="button" role="radio" data-lang="${l}" aria-checked="${l === getLang()}" lang="${l}">${l.toUpperCase()}</button>`).join('')}
    </div>
    <a class="btn btn-primary mbar-site" href="./" aria-label="${esc(t('map.tosite'))}">${icon('home')}<span>${esc(t('map.tosite'))}</span></a>`;
}

function openFilters() {
  if (!data) return;
  openFilterSheet({
    serviceId: 'all', base: data.items, filters: parseFilters(params()),
    onApply: next => { writeState(filtersToParams(next, params())); draw(); },
  });
}

function resetFilters() {
  const keep = new URLSearchParams();
  FILTER_STATE.forEach(k => { const v = params().get(k); if (v) keep.set(k, v); });
  writeState(keep);
  draw();
}

function draw() {
  page?.destroy?.();
  document.title = t('map.title') + ' · Homes in Georgia';
  const view = document.createElement('div');
  view.className = 'view';
  main.replaceChildren(view);
  page = renderMap(view, data, params(), { standalone: true, onState: writeState, onFilters: openFilters, onReset: resetFilters });
}

async function start() {
  enterEntry();
  renderBar();
  main.innerHTML = loadingView();
  try {
    data = await loadFeed();
    setRates(data.rates_usd);
    markLive(data.counts);
  } catch {
    main.innerHTML = errorView();
    main.querySelector('[data-retry]')?.addEventListener('click', start);
    return;
  }
  draw();
}

bar.addEventListener('click', e => {
  if (e.target.closest('[data-open-filters]')) return openFilters();
  const langBtn = e.target.closest('[data-lang]');
  if (langBtn && langBtn.dataset.lang !== getLang()) {
    langBtn.parentElement.style.setProperty('--i', languages.indexOf(langBtn.dataset.lang));
    setLang(langBtn.dataset.lang);
    setTimeout(() => { renderBar(); if (data) draw(); }, 180);
  }
});

installInteractions();
start();
