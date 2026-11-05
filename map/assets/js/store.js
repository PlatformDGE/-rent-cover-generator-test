// Made with Claude (Anthropic) · © Homes in Georgia · Created by Irakli Kvirkvelia
import { t, localeOf } from './i18n.js';
import { canonicalPlace, placeSearchText } from './places.js';


// ---------- data ----------
let feed;
export function loadFeed() {
  feed ??= fetch('data/listings.json?v=' + Math.floor(Date.now() / 6e5), { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then(data => {
      data.items.forEach(x => {
        cleanItem(x);
        // Search covers the listing ID ("547672" or "rent-547672"), the address and place names in RU / EN / KA.
        x._text = [x.id, x.id.replace(/^\D+-/, ''), x.title, x.headline, placeSearchText(x.district), placeSearchText(x.metro), x.pickup, x.kind, x.year, x.description].filter(Boolean).join(' ').toLowerCase();
        x._ts = Date.parse(x.published_at) || 0;
      });
      data.byId = new Map(data.items.map(x => [x.id, x]));
      return data;
    })
    .catch(err => { feed = undefined; throw err; });
  return feed;
}

// Safety net for listings built before the cleaner rules in scripts/build_site_listings.py.
const METRO_STATIONS = new Set(['Rustaveli', 'Liberty Square', 'Technical University', 'Medical University', 'State University', 'Delisi',
  'Vazha-Pshavela', 'Sarajishvili', 'Marjanishvili', '300 Aragveli', 'Station Square', 'Akhmeteli Theatre', 'Tsereteli', 'Grmagele', 'Guramishvili']);
const CAR_FIXES = [[/\bMersedes(?:[- ]Benz)?\b/gi, 'Mercedes-Benz'], [/\bMercedes(?![- ]Benz)\b/gi, 'Mercedes-Benz'], [/\bCompas\b/gi, 'Compass']];
function cleanItem(x) {
  if (x.district) x.district = canonicalPlace(x.district);
  if (x.metro) x.metro = canonicalPlace(x.metro);
  if (x.district && !x.metro && METRO_STATIONS.has(x.district)) { x.metro = x.district; delete x.district; }
  if (x.kind === 'car' && x.title) {
    x.title = x.title.split(/\s*\|\s*|\s+(?:19|20)\d\d\s*[$₾€]/)[0].trim();
    CAR_FIXES.forEach(([re, good]) => { x.title = x.title.replace(re, good); });
  }
}

// "all" is the cross-service real-estate search, so cars stay out of it.
export const itemsFor = (data, service) =>
  data.items.filter(x => (service === 'all' ? x.kind !== 'car' : x.service === service));

// ---------- persistent preferences ----------
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

const favs = new Set(read('hig:fav', []));
const favListeners = new Set();
export const isFav = id => favs.has(id);
export const favIds = () => [...favs];
export function toggleFav(id) {
  favs.has(id) ? favs.delete(id) : favs.add(id);
  write('hig:fav', [...favs]);
  favListeners.forEach(fn => fn(favs.size));
  return favs.has(id);
}
export const onFavChange = fn => favListeners.add(fn);

const recent = read('hig:recent', []);
export function addRecent(id) {
  const i = recent.indexOf(id);
  if (i >= 0) recent.splice(i, 1);
  recent.unshift(id);
  recent.length = Math.min(recent.length, 12);
  write('hig:recent', recent);
}
export const recentIds = () => [...recent];

export const CURRENCIES = ['USD', 'GEL', 'EUR'];
let currency = read('hig:cur', 'USD');
export const getCurrency = () => currency;
export function setCurrency(next) { currency = next; write('hig:cur', next); }

// ---------- formatting ----------
const SYMBOL = { USD: '$', GEL: '₾', EUR: '€' };
const DEFAULT_RATES = { USD: 1, GEL: 1 / 2.7, EUR: 1.08 };
let rates = DEFAULT_RATES;
export const setRates = r => { rates = { ...DEFAULT_RATES, ...(r || {}) }; };

const locale = () => localeOf();
export const num = n => Math.round(n).toLocaleString(locale()).replace(/ /g, ' ');

export function money(amountUsd, cur = currency) {
  const value = amountUsd / rates[cur];
  return SYMBOL[cur] + num(value >= 10000 ? Math.round(value / 100) * 100 : value);
}

export const toUsd = (v, cur = currency) => v * rates[cur];
export const fromUsd = (v, cur = currency) => v / rates[cur];
export const currencySymbol = (cur = currency) => SYMBOL[cur];

export function compactMoney(amountUsd, cur = currency) {
  const v = amountUsd / rates[cur];
  const s = SYMBOL[cur];
  if (v >= 1e6) return s + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (v >= 1e4) return s + Math.round(v / 1e3) + 'K';
  if (v >= 1e3) return s + (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return s + Math.round(v);
}

/** The listed price exactly as the owner set it (₾ stays ₾), plus "≈" in the visitor's currency when it differs. */
export function priceLabel(x) {
  if (!x.price_usd) return { main: t('price.request'), period: '', approx: '' };
  const period = x.period ? t('period.' + x.period) : '';
  const listed = x.price && SYMBOL[x.currency] ? SYMBOL[x.currency] + num(x.price) : money(x.price_usd, 'USD');
  const approx = x.currency === currency || !SYMBOL[x.currency] ? '' : '≈ ' + money(x.price_usd);
  return { main: listed, period, approx };
}
/** Short number shown on cards: "rent-547672" → "547672". */
export const shortId = id => String(id || '').replace(/^\D+-/, '');

export function ago(iso) {
  const ts = Date.parse(iso);
  if (!ts) return '';
  const h = Math.floor((Date.now() - ts) / 36e5);
  if (h < 1) return t('ago.now');
  if (h < 24) return t('ago.h', h);
  const d = Math.floor(h / 24);
  if (d < 30) return t('ago.d', d);
  return new Date(ts).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

export const isFresh = x => Date.now() - x._ts < 3 * 864e5;

// ---------- filtering ----------
// Filter state lives in the URL query: every key below is a query param.
export const LIST_KEYS = ['beds', 'kind', 'deal', 'district', 'building', 'condition', 'amen', 'gearbox', 'fuel', 'body', 'heating'];
export const RANGE_KEYS = ['price', 'area', 'year', 'mileage'];
export const FLAG_KEYS = ['pets', 'excl'];

export function parseFilters(params) {
  const f = { q: params.get('q') || '', sort: params.get('sort') || 'new', metro: params.get('metro') || '', term: params.get('term') || '' };
  LIST_KEYS.forEach(k => { f[k] = (params.get(k) || '').split(',').filter(Boolean); });
  RANGE_KEYS.forEach(k => {
    const [a, b] = (params.get(k) || '').split('-').map(v => (v === '' || v == null ? null : +v));
    f[k] = [Number.isFinite(a) ? a : null, Number.isFinite(b) ? b : null];
  });
  FLAG_KEYS.forEach(k => { f[k] = params.get(k) === '1'; });
  return f;
}

export function filtersToParams(f, params = new URLSearchParams()) {
  const set = (k, v) => (v ? params.set(k, v) : params.delete(k));
  set('q', f.q.trim());
  set('sort', f.sort === 'new' ? '' : f.sort);
  set('metro', f.metro);
  set('term', f.term);
  LIST_KEYS.forEach(k => set(k, f[k].join(',')));
  RANGE_KEYS.forEach(k => set(k, f[k][0] == null && f[k][1] == null ? '' : `${f[k][0] ?? ''}-${f[k][1] ?? ''}`));
  FLAG_KEYS.forEach(k => set(k, f[k] ? '1' : ''));
  return params;
}

export function activeCount(f) {
  return LIST_KEYS.reduce((n, k) => n + f[k].length, 0)
    + RANGE_KEYS.filter(k => f[k][0] != null || f[k][1] != null).length
    + FLAG_KEYS.filter(k => f[k]).length + (f.metro ? 1 : 0) + (f.term ? 1 : 0);
}

const inRange = (v, [a, b]) => (a == null || (v != null && v >= a)) && (b == null || (v != null && v <= b));

function termMatch(x, term) {
  const m = x.months || [];
  if (!m.length) return false;
  if (term === 'short') return m.some(v => v <= 6);
  if (term === 'year') return m.includes(12);
  return m.some(v => v >= 24);
}

export function applyFilters(items, f, skip = '') {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(x =>
    (!words.length || words.every(w => x._text.includes(w)))
    && (skip === 'price' || inRange(x.price_usd, f.price))
    && (skip === 'area' || inRange(x.area, f.area))
    && (skip === 'year' || inRange(x.year, f.year))
    && (skip === 'mileage' || inRange(x.mileage, f.mileage))
    && (!f.deal.length || f.deal.includes(x.deal))
    && (!f.gearbox.length || f.gearbox.includes(x.gearbox))
    && (!f.fuel.length || f.fuel.includes(x.fuel))
    && (!f.body.length || f.body.includes(x.body))
    && (!f.beds.length || f.beds.some(b => (b === '4' ? x.rooms >= 4 : x.rooms === +b)))
    && (!f.kind.length || f.kind.includes(x.kind))
    && (skip === 'district' || !f.district.length || f.district.includes(x.district))
    && (!f.metro || x.metro === f.metro)
    && (!f.building.length || f.building.includes(x.building))
    && (!f.condition.length || f.condition.includes(x.condition))
    && (!f.heating.length || f.heating.includes(x.heating))
    && (!f.amen.length || f.amen.every(a => x.amenities?.includes(a)))
    && (!f.pets || x.pets === 'allowed' || x.pets === 'agreement')
    && (!f.term || termMatch(x, f.term))
    && (!f.excl || x.exclusive));
}

const SORTS = {
  new: (a, b) => b._ts - a._ts,
  cheap: (a, b) => (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity),
  expensive: (a, b) => (b.price_usd ?? -1) - (a.price_usd ?? -1),
  area: (a, b) => (b.area ?? -1) - (a.area ?? -1),
  year: (a, b) => (b.year ?? -1) - (a.year ?? -1),
  ppsqm: (a, b) => (a.ppsqm_usd ?? Infinity) - (b.ppsqm_usd ?? Infinity),
};
export const sortItems = (rows, sort) => rows.sort(SORTS[sort] || SORTS.new);

export function countBy(items, key) {
  const map = new Map();
  items.forEach(x => { const v = x[key]; if (v != null && v !== '') map.set(v, (map.get(v) || 0) + 1); });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}
