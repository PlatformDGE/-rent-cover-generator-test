// Made with Claude (Anthropic) · © Homes in Georgia · Created by Irakli Kvirkvelia
// Page scrolling and "come back to the same place": every history entry gets a
// key, and what the visitor was looking at is remembered under that key.
const STORE = 'hig:positions';
const MAX_ENTRIES = 60;
const phone = matchMedia('(max-width: 999px)');
let currentKey = null, restoreToken = 0;

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// Phones scroll an inner area between the fixed header and tab bar; desktop scrolls the window.
export const scrollRoot = () => (phone.matches ? document.getElementById('scroller') : null);
const scrollEl = () => scrollRoot() || document.scrollingElement;
export const pageTop = () => scrollEl().scrollTop;
export function setPageTop(y) { scrollEl().scrollTop = y; }

function readAll() {
  try { return JSON.parse(sessionStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function writeAll(all) {
  const keys = Object.keys(all);
  keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES)).forEach(k => delete all[k]);
  try { sessionStorage.setItem(STORE, JSON.stringify(all)); } catch { /* private mode: nothing to restore later */ }
}
const newKey = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Extra state of the current entry, e.g. the map's centre and the open card.
export const entryData = () => (currentKey && readAll()[currentKey]) || {};
export function saveEntry(patch) {
  if (!currentKey) return;
  const all = readAll();
  all[currentKey] = { ...all[currentKey], ...patch };
  writeAll(all);
}

// Called by the router on every navigation. True when returning to a known entry.
export function enterEntry() {
  if (currentKey) saveEntry({ top: pageTop() });
  const revisit = !!history.state?.k;
  if (!revisit) history.replaceState({ k: newKey(), inner: !!currentKey }, '', location.href);
  currentKey = history.state.k;
  return revisit;
}

// Same entry, new address (filters changed).
export function replaceHash(hash) { history.replaceState(history.state, '', hash); }
// New entry without leaving the page (filters applied from the sheet).
export function pushHash(hash) {
  saveEntry({ top: pageTop() });
  currentKey = newKey();
  history.pushState({ k: currentKey, inner: true }, '', hash);
}

// True when this page was reached from another page of the site in this tab.
export const cameFromSite = () => !!history.state?.inner;

// Lists grow as they scroll, so keep trying until the saved position exists.
export function restoreTop() {
  const token = ++restoreToken;
  const target = entryData().top || 0;
  let tries = 0;
  const stop = () => { restoreToken++; };
  addEventListener('touchstart', stop, { once: true, passive: true });
  addEventListener('wheel', stop, { once: true, passive: true });
  const step = () => {
    if (token !== restoreToken) return;
    setPageTop(target);
    if (Math.abs(pageTop() - target) < 2 || ++tries > 60) return;
    setTimeout(step, 50);
  };
  step();
}
export function cancelRestore() { restoreToken++; }

// The bottom bar must sit above the browser's own toolbar on every phone.
function fitViewport() {
  const v = window.visualViewport;
  if (v && v.scale < 1.01) document.documentElement.style.setProperty('--app-h', v.height + 'px');
}
window.visualViewport?.addEventListener('resize', fitViewport);
addEventListener('orientationchange', fitViewport);
fitViewport();
