// Made with Claude (Anthropic) · © Homes in Georgia · Created by Irakli Kvirkvelia
// Single place for business configuration: services, contacts, channels.
// Copy lives in i18n.js; this file only describes structure and behaviour.

export const CONTACT = {
  telegram: 'David_Tibelashvili',
  phone: '+995 599 20 67 16',
};

// Public Telegram channel of every direction.
export const CHANNELS = {
  rent: 'rent_tbilisi_ge',
  sale: 'homesingeorgia',
  commercial: 'commercialingeorgia',
  daily: 'dayrentingeorgia',
  new: 'DevelopmentIngeorgia',
  'car-rent': 'CarsRentInGeorgia',
  'car-sale': 'CarsSaleInGeorgia',
};

export const phoneHref = phone => 'tel:' + String(phone || CONTACT.phone).replace(/[^\d+]/g, '');
export const whatsappHref = (phone, text = '') =>
  'https://wa.me/' + String(phone || CONTACT.phone).replace(/\D/g, '') + (text ? '?text=' + encodeURIComponent(text) : '');
// `text` pre-fills the message in the chat (Telegram's ?text= username-link parameter).
export const telegramHref = (user, text = '') =>
  'https://t.me/' + String(user || CONTACT.telegram).replace(/^@/, '') + (text ? '?text=' + encodeURIComponent(text) : '');

// A service turns into a live catalogue as soon as its channel has offers in
// site/data/listings.json (see markLive); until then it shows a "coming soon" page.
// `filters` lists the filter panel sections of the catalogue.
const REALTY = ['price', 'beds', 'kind', 'area', 'district', 'metro'];
export const SERVICES = {
  rent: { group: 'realty', icon: 'key', filters: [...REALTY, 'building', 'heating', 'amenities', 'pets', 'term', 'flags'] },
  sale: { group: 'realty', icon: 'tag', filters: [...REALTY, 'building', 'condition', 'heating', 'flags'] },
  commercial: { group: 'realty', icon: 'building', filters: ['price', 'deal', 'area', 'district', 'metro', 'condition', 'heating', 'flags'] },
  daily: { group: 'realty', icon: 'moon', filters: ['price', 'beds', 'district', 'metro', 'heating', 'amenities', 'flags'] },
  new: { group: 'realty', icon: 'crane', filters: ['price', 'beds', 'area', 'district', 'metro', 'condition', 'heating', 'flags'] },
  'car-rent': { group: 'auto', icon: 'car', filters: ['price', 'body', 'gearbox', 'fuel', 'year', 'flags'] },
  'car-sale': { group: 'auto', icon: 'gauge', filters: ['price', 'body', 'year', 'mileage', 'gearbox', 'fuel', 'flags'] },
};

export const GROUPS = {
  realty: { icon: 'home', services: ['rent', 'sale', 'commercial', 'daily', 'new'] },
  auto: { icon: 'car', services: ['car-rent', 'car-sale'] },
};

export function markLive(counts = {}) {
  Object.entries(SERVICES).forEach(([id, s]) => { s.live = (counts[id] || 0) > 0; });
}

// Pseudo-service used by the global search: every live real-estate offer.
export const ALL = { group: 'realty', icon: 'search', live: true, filters: [...REALTY, 'heating', 'flags'] };

export const serviceOf = id => (id === 'all' ? ALL : SERVICES[id]);

export const AMENITY_ORDER = ['conditioner', 'wifi', 'dishwasher', 'washer', 'oven', 'microwave', 'stove', 'tv', 'balcony',
  'terrace', 'courtyard', 'elevator', 'parking', 'pool', 'gym', 'fireplace', 'view', 'vacuum', 'storage', 'security', 'generator', 'playground'];

export const FILTER_AMENITIES = ['conditioner', 'dishwasher', 'washer', 'balcony', 'terrace', 'elevator', 'parking', 'oven', 'wifi', 'courtyard'];

export const MAP_CENTER = [41.7151, 44.8271];

// MapTiler key is public by design (it ships to the browser); it is restricted
// to the site's domain in the MapTiler dashboard (Account → API keys).
export const MAPTILER_KEY = '8rgCgBliYpwKCmMzEVV8';

// Total map. One switch per Telegram channel; the marker icon follows the post's
// own hashtag (#Apartment → apartment block, #House → house, #Commercial → kiosk,
// #Land → plot, cars → car); colour = freshness of the post.
export const MAP_CHANNELS = [
  { id: 'rent', icon: 'key' },
  { id: 'daily', icon: 'moon' },
  { id: 'sale', icon: 'tag' },
  { id: 'commercial', icon: 'kiosk' },
  { id: 'new', icon: 'crane' },
  { id: 'car-rent', icon: 'car' },
  { id: 'car-sale', icon: 'gauge' },
];
export const KIND_ICONS = { apartment: 'building', house: 'home', commercial: 'kiosk', land: 'land', car: 'car' };
// homesingeorgia ("homes") and the older sale_in_tbilisi ("sale") are one sale direction.
export const channelOf = x => (x.source === 'homes' ? 'sale' : x.source || x.service);

export const FRESHNESS = [
  { id: 'fresh', maxDays: 5, color: '#2DB87A' },
  { id: 'recent', maxDays: 20, color: '#F3A712' },
  { id: 'old', maxDays: Infinity, color: '#E5532E' },
];
export function freshnessOf(x) {
  const days = (Date.now() - (Date.parse(x.published_at) || 0)) / 864e5;
  return FRESHNESS.find(f => days < f.maxDays);
}
