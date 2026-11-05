import { t, getLang, setLang, languages, localeOf } from './i18n.js';
import { icon, logo } from './icons.js';
import { SERVICES, GROUPS, CONTACT, CHANNELS, telegramHref, phoneHref, whatsappHref, markLive } from './config.js';
import { esc, installInteractions, serviceIcon, loadingView, errorView } from './components.js';
import { loadFeed, favIds, onFavChange, CURRENCIES, getCurrency, setCurrency, setRates } from './store.js';
import { openShare } from './share.js';
import { enterEntry, setPageTop, restoreTop, cancelRestore, scrollRoot, pageTop } from './scroll.js';
import { renderHome } from './pages/home.js';
import { renderMap } from './pages/map.js';
import { renderCatalog } from './pages/catalog.js';
import { renderListing } from './pages/listing.js';
import { renderSoon, renderFavorites, renderNotFound } from './pages/misc.js';

// Light is the main theme; dark is opt-in from the header and remembered.
const isDark = () => document.documentElement.dataset.theme === 'dark';
// A tap that lands on the moon while the page is scrolling must not switch the theme.
let lastScrollAt = 0;
document.addEventListener('scroll', () => { lastScrollAt = Date.now(); }, { passive: true, capture: true });
function setTheme(theme) {
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#0B1220' : '#032D6A');
  try { localStorage.setItem('hig:theme', theme); } catch {}
}

const header = document.getElementById('header');
const main = document.getElementById('main');
const footer = document.getElementById('footer');
const tabbar = document.getElementById('tabbar');
let current = null; // { key, page }
let data = null;

function megaMenu(group) {
  return `<div class="mega" role="menu">
    ${GROUPS[group].services.map(s => `<a role="menuitem" href="#/${s}" class="mega-item">
      <span class="svc-ico">${icon(serviceIcon(s))}</span>
      <span><b>${t('svc.' + s)}${SERVICES[s].live ? '' : `<sup>${t('svc.soon')}</sup>`}</b><small>${t('svc.' + s + '.desc')}</small></span>
    </a>`).join('')}
  </div>`;
}

function renderHeader() {
  const favs = favIds().length;
  header.innerHTML = `
  <div class="container nav">
    <a class="brand" href="#/" aria-label="Homes in Georgia">${logo()}</a>
    <nav class="nav-main" aria-label="main">
      ${Object.keys(GROUPS).map(g => `<div class="nav-drop"><button type="button" class="nav-link" aria-haspopup="true" aria-expanded="false">${t('nav.' + g)}${icon('down')}</button>${megaMenu(g)}</div>`).join('')}
      <a class="nav-link nav-map" href="#/map">${icon('map')}${t('nav.map')}</a>
    </nav>
    <div class="nav-tools">
      <div class="select mini">${icon('down')}<select id="cur" aria-label="Currency">${CURRENCIES.map(c => `<option${c === getCurrency() ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="lang-seg" role="radiogroup" aria-label="Language" style="--i:${languages.indexOf(getLang())}">
        <i class="lang-thumb" aria-hidden="true"></i>
        ${languages.map(l => `<button type="button" role="radio" data-lang="${l}" aria-checked="${l === getLang()}" lang="${l}">${l.toUpperCase()}</button>`).join('')}
      </div>
      <button type="button" class="icon-btn theme-btn" data-theme-toggle aria-label="${esc(t(isDark() ? 'nav.theme.light' : 'nav.theme.dark'))}" title="${esc(t(isDark() ? 'nav.theme.light' : 'nav.theme.dark'))}">${icon(isDark() ? 'sun' : 'moon')}</button>
      <a class="icon-btn fav-link" href="#/favorites" aria-label="${esc(t('nav.favorites'))}">${icon('heart')}<b class="nbadge">${favs || ''}</b></a>
      <a class="btn btn-primary nav-cta" href="${telegramHref(CONTACT.telegram)}" target="_blank" rel="noopener" data-lead="telegram">${icon('send')}<span>${t('nav.contact')}</span></a>
      <button type="button" class="icon-btn burger" aria-label="${esc(t('nav.menu'))}" aria-expanded="false">${icon('menu')}</button>
    </div>
  </div>
  <div class="drawer" hidden>
    <div class="container">
      ${Object.keys(GROUPS).map(g => `<p class="drawer-h">${t('group.' + g)}</p>${megaMenu(g)}`).join('')}
      <div class="drawer-contact">
        <a class="btn btn-primary btn-block" href="${telegramHref(CONTACT.telegram)}" target="_blank" rel="noopener">${icon('send')}<span>Telegram</span></a>
        <a class="btn btn-outline btn-block" href="${phoneHref()}">${icon('phone')}<span>${esc(CONTACT.phone)}</span></a>
        <a class="btn btn-outline btn-block" href="${whatsappHref()}" target="_blank" rel="noopener">${icon('whatsapp')}<span>WhatsApp</span></a>
      </div>
    </div>
  </div>`;
}

function rateLine() {
  const r = data?.rates_usd;
  if (!r || data.rates_source !== 'NBG') return '';
  const fmt = v => v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  const date = data.rates_date ? new Date(data.rates_date).toLocaleDateString(localeOf()) : '';
  return '<br>' + esc(t('footer.rates', date, fmt(1 / r.GEL), fmt(r.EUR / r.GEL)));
}

function renderFooter() {
  footer.innerHTML = `
  <div class="container foot">
    <div class="foot-brand">${logo('logo-light')}<p>${t('footer.about')}</p></div>
    ${Object.keys(GROUPS).map(g => `<div><h4>${t('group.' + g)}</h4>${GROUPS[g].services.map(s => `<a href="#/${s}">${t('svc.' + s)}</a>`).join('')}</div>`).join('')}
    <div><details class="foot-channels"><summary>${t('footer.channels')}${icon('down')}</summary>${Object.entries(CHANNELS).map(([s, c]) => `<a href="${telegramHref(c)}" target="_blank" rel="noopener" title="${esc(t('svc.' + s))}">@${c}</a>`).join('')}</details>
      <h4>${t('footer.contact')}</h4><a href="${phoneHref()}">${esc(CONTACT.phone)}</a><a href="${telegramHref()}" target="_blank" rel="noopener">Telegram: @${esc(CONTACT.telegram)}</a><a href="${whatsappHref()}" target="_blank" rel="noopener">WhatsApp: ${esc(CONTACT.phone)}</a></div>
  </div>
  <div class="container foot-bottom"><span>© ${new Date().getFullYear()} Homes in Georgia. ${t('footer.rights')}</span><span>${t('footer.data')}${rateLine()}</span></div>`;
}

function renderTabbar(route) {
  const items = [['#/', 'home', t('nav.home'), route === ''], ['#/all', 'search', t('nav.search'), route === 'all' || (SERVICES[route] && true)],
    ['#/map', 'map', t('nav.map'), route === 'map'],
    ['#/favorites', 'heart', t('nav.favorites'), route === 'favorites'], [telegramHref(CONTACT.telegram), 'send', t('nav.contact'), false]];
  tabbar.innerHTML = items.map(([href, ic, label, on]) =>
    `<a href="${href}"${href.startsWith('http') ? ' target="_blank" rel="noopener"' : ''} class="${on ? 'on' : ''}">${icon(ic)}<span>${esc(label)}</span>${ic === 'heart' && favIds().length ? '<b class="dot"></b>' : ''}</a>`).join('');
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query), path };
}

async function route() {
  const { parts, params, path } = parseHash();
  const [first = '', second] = parts;
  const key = first === 'listing' ? path : first;
  const revisit = enterEntry();
  cancelRestore();

  // Same catalog, only filters changed (back/forward): update in place.
  if (current && current.key === key && current.page?.update) {
    current.page.update(params);
    if (revisit) restoreTop();
    return;
  }
  current?.page?.destroy?.();
  document.querySelectorAll('.sheet-wrap, .lightbox').forEach(el => el.remove());
  document.body.classList.remove('locked');
  document.title = 'Homes in Georgia — ' + t('brand.tagline');
  header.querySelector('.drawer')?.setAttribute('hidden', '');
  document.body.classList.remove('menu-open');
  renderTabbar(first);

  const view = document.createElement('div');
  view.className = 'view';
  main.replaceChildren(view);
  setPageTop(0);
  current = { key, page: null };

  // The feed also decides which services are live, so every page waits for it.
  if (!data) {
    view.innerHTML = loadingView();
    try {
      data = await loadFeed();
      setRates(data.rates_usd);
      markLive(data.counts);
      renderHeader();
      renderFooter();
    } catch {
      view.innerHTML = errorView();
      view.querySelector('[data-retry]')?.addEventListener('click', () => { current = null; route(); });
      return;
    }
    if (!main.contains(view)) return; // navigated away while loading
  }

  if (first === '') renderHome(view, data);
  else if (first === 'all') { current.page = renderCatalog(view, data, 'all', params); document.title = t('svc.all') + ' · Homes in Georgia'; }
  else if (SERVICES[first]?.live) { current.page = renderCatalog(view, data, first, params); document.title = t('svc.' + first) + ' · Homes in Georgia'; }
  else if (SERVICES[first]) { renderSoon(view, first); document.title = t('svc.' + first) + ' · Homes in Georgia'; }
  else if (first === 'listing' && second) renderListing(view, data, decodeURIComponent(second));
  else if (first === 'favorites') renderFavorites(view, data);
  else if (first === 'map') { current.page = renderMap(view, data, params); document.title = t('map.title') + ' · Homes in Georgia'; }
  else renderNotFound(view);
  view.focus?.({ preventScroll: true });
  if (revisit) restoreTop();
}

function rerenderAll() {
  renderHeader();
  renderFooter();
  current = null;
  route();
}

header.addEventListener('change', e => {

  if (e.target.id === 'cur') { setCurrency(e.target.value); rerenderAll(); }
});
header.addEventListener('click', e => {
  if (e.target.closest('[data-theme-toggle]')) { if (Date.now() - lastScrollAt < 400) return; setTheme(isDark() ? 'light' : 'dark'); renderHeader(); return; }
  const langBtn = e.target.closest('[data-lang]');
  if (langBtn) {
    if (langBtn.dataset.lang === getLang()) return;
    // Slide the glass thumb first, then re-render in the new language.
    langBtn.parentElement.style.setProperty('--i', languages.indexOf(langBtn.dataset.lang));
    setLang(langBtn.dataset.lang);
    setTimeout(rerenderAll, 180);
    return;
  }
  const burger = e.target.closest('.burger');
  if (burger) {
    const drawer = header.querySelector('.drawer');
    const open = drawer.hasAttribute('hidden');
    drawer.toggleAttribute('hidden', !open);
    burger.setAttribute('aria-expanded', open);
    document.body.classList.toggle('menu-open', open);
    return;
  }
  const drop = e.target.closest('.nav-link');
  if (drop) {
    const wrap = drop.parentElement;
    const open = !wrap.classList.contains('open');
    header.querySelectorAll('.nav-drop').forEach(d => { d.classList.remove('open'); d.querySelector('.nav-link').setAttribute('aria-expanded', 'false'); });
    wrap.classList.toggle('open', open);
    drop.setAttribute('aria-expanded', open);
    return;
  }
  if (e.target.closest('.mega-item')) header.querySelectorAll('.nav-drop').forEach(d => d.classList.remove('open'));
});
document.addEventListener('click', e => {
  const share = e.target.closest('[data-share-id]');
  if (share && data) {
    e.preventDefault();
    const item = data.byId.get(share.dataset.shareId);
    if (item) openShare(item);
    return;
  }
  if (!e.target.closest('.nav-drop')) header.querySelectorAll('.nav-drop.open').forEach(d => d.classList.remove('open'));
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') header.querySelectorAll('.nav-drop.open').forEach(d => d.classList.remove('open'));
});
(scrollRoot() || window).addEventListener('scroll', () => header.classList.toggle('scrolled', pageTop() > 8), { passive: true });
onFavChange(n => {
  const badge = header.querySelector('.fav-link .nbadge');
  if (badge) badge.textContent = n || '';
  renderTabbar(parseHash().parts[0] || '');
});

window.addEventListener('hashchange', route);
installInteractions();
renderHeader();
renderFooter();
route();
