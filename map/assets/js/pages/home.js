// Made with Claude (Anthropic) · © Homes in Georgia · Created by Irakli Kvirkvelia
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { SERVICES, GROUPS, telegramHref, CONTACT } from '../config.js';
import { esc, rail, serviceIcon } from '../components.js';
import { countBy, compactMoney, num, itemsFor, recentIds, parseFilters, applyFilters } from '../store.js';

/** Budget steps from the real price distribution of a service (rounded quantiles). */
function budgets(pool) {
  const prices = pool.map(x => x.price_usd).filter(Boolean).sort((a, b) => a - b);
  if (prices.length < 4) return [];
  const nice = v => { const p = 10 ** Math.max(1, Math.floor(Math.log10(v)) - 1); return Math.round(v / p) * p; };
  return [...new Set([0.25, 0.5, 0.7, 0.85, 0.95].map(q => nice(prices[Math.floor(q * (prices.length - 1))])))];
}

const allServices = () => Object.values(GROUPS).flatMap(g => g.services);

// Finder tabs: live directions only; cars open car rental (sale is one tab away there).
const FINDER = ['rent', 'sale', 'commercial', 'daily', 'car-rent'];
const BEDS = ['0', '1', '2', '3', '4'];

// Look of the home search; #/?finder=dark|photo|phrase previews the others.
const FINDER_STYLE = 'light';
const finderStyle = () => new URLSearchParams(location.hash.split('?')[1] || '').get('finder') || FINDER_STYLE;

/** "I want to [rent] · district [any] · budget up to [any]" — the phrase-style search. */
function phraseBody(data, service) {
  const pool = itemsFor(data, service);
  const districts = countBy(pool, 'district').slice(0, 16);
  const steps = budgets(pool);
  const period = pool.find(x => x.period)?.period;
  const sel = (name, opts) => `<span class="fd-pick"><select name="${name}">${opts}</select>${icon('down')}</span>`;
  return `
    <p class="fd-phrase">
      <span>${t('home.finder.want')}</span>
      ${sel('svc', FINDER.filter(s => SERVICES[s].live).map(s => `<option value="${s}"${s === service ? ' selected' : ''}>${t('home.finder.want.' + s)}</option>`).join(''))}
      ${districts.length ? `<span>${t('home.finder.in')}</span>${sel('district', `<option value="">${t('home.finder.any')}</option>${districts.map(([d]) => `<option value="${esc(d)}">${esc(placeName(d))}</option>`).join('')}`)}` : ''}
      ${steps.length ? `<span>${t('home.finder.upto')}</span>${sel('max', `<option value="">${t('home.finder.any')}</option>${steps.map(v => `<option value="${v}">${compactMoney(v)}${period ? ' ' + t('period.' + period) : ''}</option>`).join('')}`)}` : ''}
    </p>
    <button class="btn fd-go" type="submit">${icon('search')}<span class="fd-go-label"></span>${icon('arrow')}</button>`;
}

/** The home search: direction tabs, free text, district, budget, bedrooms, and a live result count. */
function finderBody(data, service) {
  const pool = itemsFor(data, service);
  const isCar = SERVICES[service].group === 'auto';
  const districts = countBy(pool, 'district').slice(0, 16);
  const steps = budgets(pool);
  const period = pool.find(x => x.period)?.period;
  const rooms = !isCar && service !== 'commercial' && pool.some(x => x.rooms != null);
  const pets = service === 'rent' && pool.some(x => x.pets);
  return `
    <label class="fd-search">${icon('search')}<input name="q" type="search" autocomplete="off" placeholder="${esc(t(isCar ? 'cat.search.car' : 'cat.search'))}" aria-label="${esc(t(isCar ? 'cat.search.car' : 'cat.search'))}"></label>
    <div class="fd-row">
      ${districts.length ? `<label class="fd-field"><span>${t('home.where')}</span><span class="fd-sel"><select name="district"><option value="">${t('home.where.any')}</option>${districts.map(([d, n]) => `<option value="${esc(d)}">${esc(placeName(d))} · ${n}</option>`).join('')}</select>${icon('down')}</span></label>` : ''}
      ${steps.length ? `<label class="fd-field"><span>${t('home.budget')}</span><span class="fd-sel"><select name="max"><option value="">${t('home.budget.any')}</option>${steps.map(v => `<option value="${v}">${compactMoney(v)}${period ? ' ' + t('period.' + period) : ''}</option>`).join('')}</select>${icon('down')}</span></label>` : ''}
      ${rooms ? `<div class="fd-field fd-beds" role="group" aria-label="${esc(t('f.beds'))}"><span>${t('f.beds')}</span><div class="fd-seg">${BEDS.map(b => `<button type="button" data-bed="${b}" aria-pressed="false">${b === '0' ? t('f.studio') : b === '4' ? '4+' : b}</button>`).join('')}</div></div>` : ''}
    </div>
    ${pets ? `<div class="fd-chips">
      ${pets ? `<button type="button" class="fd-chip" data-flag="pets" aria-pressed="false">${icon('heart')}${t('f.pets')}</button>` : ''}
    </div>` : ''}
    <button class="btn fd-go" type="submit">${icon('search')}<span class="fd-go-label"></span>${icon('arrow')}</button>`;
}

// Home page entrances: one big tile per space. Cars join both car services.
const GATES = [
  { id: 'rent', services: ['rent'] },
  { id: 'sale', services: ['sale'] },
  { id: 'commercial', services: ['commercial'] },
  { id: 'daily', services: ['daily'] },
  { id: 'new', services: ['new'] },
  { id: 'cars', services: ['car-rent', 'car-sale'], icon: 'car' },
];

// Look of the section tiles; #/?gate=tiles|bento|panels|list previews the others.
const GATE_STYLE = 'cards';
const gateStyle = () => new URLSearchParams(location.hash.split('?')[1] || '').get('gate') || GATE_STYLE;
// Backdrop behind the glass cards; #/?bg=deep|city|grid|photos previews the others.
const BG_STYLE = 'aurora';
const bgStyle = () => new URLSearchParams(location.hash.split('?')[1] || '').get('bg') || BG_STYLE;

function gateTile(g, i, data) {
  const live = g.services.filter(s => SERVICES[s].live);
  const target = live[0] || g.services[0];
  const count = g.services.reduce((n, s) => n + (data.counts?.[s] || 0), 0);
  const photo = live.flatMap(s => itemsFor(data, s)).filter(x => x.photos?.length).sort((a, b) => b._ts - a._ts)[0]?.photos[0];
  // Sales hook: the entry price and how many offers arrived this week.
  const pool = live.length ? itemsFor(data, target) : [];
  const min = Math.min(...pool.map(x => x.price_usd).filter(Boolean));
  const period = pool.find(x => x.period)?.period;
  const week = live.flatMap(s => itemsFor(data, s)).filter(x => Date.now() - x._ts < 7 * 864e5).length;
  const hook = [Number.isFinite(min) ? t('home.gate.from', compactMoney(min) + (period ? ' ' + t('period.' + period) : '')) : '',
    week ? `<span class="gate-new">${t('home.gate.week', week)}</span>` : ''].filter(Boolean).join('');
  const name = g.id === 'cars' ? t('nav.auto') : t('svc.' + g.id + '.short');
  const desc = g.id === 'cars' ? t('group.auto.desc') : t('svc.' + g.id + '.desc');
  return `<a role="listitem" class="gate-tile${photo ? '' : ' no-photo'}${live.length ? '' : ' soon'}" href="#/${target}" style="--d:${i * 60}ms">
    ${photo ? `<img src="${esc(photo)}" alt="" ${i < 2 ? 'fetchpriority="high"' : 'loading="lazy"'}>` : ''}
    <span class="gate-ico">${icon(g.icon || serviceIcon(g.id))}</span>
    <span class="gate-text"><b>${esc(name)}</b>${hook ? `<span class="gate-hook">${hook}</span>` : ''}<small>${esc(desc)}</small></span>
    <span class="gate-meta"><em>${live.length ? t('cat.count', count) : t('svc.soon')}</em>${icon('arrow')}</span>
  </a>`;
}

export function renderHome(root, data) {
  const live = data.items.length;
  const districts = countBy(data.items, 'district');
  const fresh = s => itemsFor(data, s).slice().sort((a, b) => b._ts - a._ts).filter(x => x.photos?.length).slice(0, 12);
  const recent = recentIds().map(id => data.byId.get(id)).filter(Boolean);
  const districtPhoto = d => data.items.find(x => x.district === d && x.photos?.length)?.photos[0];
  const heroPhoto = (fresh('rent')[3] || fresh('rent')[0])?.photos[0];
  // Fresh photos drifting behind the glass cards, so the page feels alive through them.
  const bgPhotos = ['rent', 'sale', 'daily', 'commercial', 'car-rent', 'rent', 'sale', 'rent']
    .map((s, i) => fresh(s)[Math.floor(i / 5) + 1]?.photos[0]).filter(Boolean);
  const firstLive = allServices().find(s => SERVICES[s].live) || 'rent';

  root.innerHTML = `
<section class="gate v-${gateStyle()}${gateStyle() === 'cards' ? ' on-' + bgStyle() : ''}">
  ${gateStyle() === 'cards' ? `<div class="gate-bg bg-${bgStyle()}" aria-hidden="true">${
    bgStyle() === 'photos' ? bgPhotos.map(src => `<img src="${esc(src)}" alt="" loading="lazy">`).join('')
    : bgStyle() === 'city' ? (heroPhoto ? `<img src="${esc(heroPhoto)}" alt="">` : '')
    : '<i></i><i></i><i></i><i></i>'}</div>` : ''}
  <div class="container">
    <h1 class="gate-title">${t('home.gate.title')}</h1>
    ${gateStyle() === 'cards' ? Object.entries(GROUPS).map(([grp, gr]) => `
    <div class="gate-group">
      <div class="gate-group-head"><h2>${t('group.' + grp)}</h2><a class="link-arrow" href="#/${grp === 'realty' ? 'all' : gr.services[0]}">${t('home.see.all')} ${icon('arrow')}</a></div>
      <div class="gate-grid" role="list">${gr.services.map((s, i) => gateTile({ id: s, services: [s] }, i, data)).join('')}</div>
    </div>`).join('') : `<div class="gate-grid" role="list">
      ${GATES.map((g, i) => gateTile(g, i, data)).join('')}
    </div>`}
  </div>
</section>

<section class="section finder-section">
  <div class="container">
    <form class="finder v-${finderStyle()}" id="finder" novalidate style="--fd-photo:url('${esc(heroPhoto ? new URL(heroPhoto, location.href).href : '')}')">
      <div class="fd-head">
        <h2>${t('home.finder.title')}</h2>
        <p class="fd-facts"><span class="live-dot"></span><b>${num(live)}</b> ${t('home.stat.live')}<i></i>${t('home.finder.hourly')}</p>
      </div>
      <div class="fd-tabs" role="tablist">${FINDER.filter(s => SERVICES[s].live).map((s, i) => `<button type="button" role="tab" data-svc="${s}" aria-selected="${i === 0}">${icon(serviceIcon(s))}<span>${s === 'car-rent' ? t('nav.auto') : t('svc.' + s + '.short')}</span></button>`).join('')}</div>
      <div class="fd-body"></div>
    </form>
  </div>
</section>

${rail('rail-recent', t('home.recent'), recent, '')}
${allServices().filter(s => SERVICES[s].live).map(s => rail('rail-' + s, t('home.fresh.' + s), fresh(s), '#/' + s)).join('')}

<section class="section">
  <div class="container">
    <div class="section-head"><div><h2>${t('home.districts.title')}</h2><p>${t('home.districts.lead')}</p></div></div>
    <div class="districts">
      ${districts.slice(0, 8).map(([d, n], i) => `
        <a class="district${i === 0 ? ' big' : ''}" href="#/all?district=${encodeURIComponent(d)}">
          ${districtPhoto(d) ? `<img src="${esc(districtPhoto(d))}" alt="" loading="lazy">` : ''}
          <span><b>${esc(placeName(d))}</b><em>${t('cat.count', n)}</em></span>
        </a>`).join('')}
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="why">
      ${[['shield', 1], ['send', 3], ['star', 4]].map(([ic, n]) => `
        <div class="why-item"><span>${icon(ic)}</span><div><h3>${t(`home.why.${n}.t`)}</h3><p>${t(`home.why.${n}.d`)}</p></div></div>`).join('')}
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="owners">
      <div><h2>${t('home.owners.title')}</h2><p>${t('home.owners.lead')}</p></div>
      <a class="btn btn-light btn-lg" href="${telegramHref(CONTACT.telegram)}" target="_blank" rel="noopener">${icon('send')}<span>${t('home.owners.cta')}</span></a>
    </div>
  </div>
</section>`;

  const form = root.querySelector('#finder');
  const body = form.querySelector('.fd-body');
  let service = FINDER.find(x => SERVICES[x].live) || firstLive;
  let state;

  // Current choices as catalogue URL params; the same params drive the live count.
  function params() {
    const q = new URLSearchParams();
    if (state.q.trim()) q.set('q', state.q.trim());
    if (state.district) q.set('district', state.district);
    if (state.max) q.set('price', '-' + state.max);
    if (state.beds.length) q.set('beds', state.beds.join(','));
    state.flags.forEach(k => q.set(k, '1'));
    return q;
  }
  // Phrase selects hug their chosen text instead of the longest option.
  function fitPicks() {
    form.querySelectorAll('.fd-pick select').forEach(sel => {
      const probe = document.createElement('span');
      probe.className = 'fd-probe';
      probe.textContent = sel.options[sel.selectedIndex]?.text || '';
      sel.parentElement.append(probe);
      sel.style.width = probe.offsetWidth + 40 + 'px';
      probe.remove();
    });
  }
  function recount() {
    const n = applyFilters(itemsFor(data, service), parseFilters(params())).length;
    const go = form.querySelector('.fd-go');
    go.classList.toggle('empty', !n);
    form.querySelector('.fd-go-label').textContent = n ? t('home.finder.show', t('cat.count', n)) : t('home.finder.none');
  }
  function mount() {
    state = { q: '', district: '', max: '', beds: [], flags: [] };
    body.innerHTML = (finderStyle() === 'phrase' ? phraseBody : finderBody)(data, service);
    fitPicks();
    form.querySelectorAll('[data-svc]').forEach(b => b.setAttribute('aria-selected', b.dataset.svc === service));
    recount();
  }
  form.addEventListener('click', e => {
    const tab = e.target.closest('[data-svc]');
    if (tab) { service = tab.dataset.svc; mount(); return; }
    const bed = e.target.closest('[data-bed]');
    const flag = e.target.closest('[data-flag]');
    const btn = bed || flag;
    if (!btn) return;
    const list = bed ? state.beds : state.flags;
    const v = bed ? bed.dataset.bed : flag.dataset.flag;
    const on = !list.includes(v);
    if (on) list.push(v); else list.splice(list.indexOf(v), 1);
    btn.setAttribute('aria-pressed', on);
    recount();
  });
  form.addEventListener('input', e => {
    if (e.target.name === 'svc') { service = e.target.value; mount(); return; }
    if (e.target.name in state) { state[e.target.name] = e.target.value; fitPicks(); recount(); }
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const q = params();
    location.hash = `#/${service}${q.toString() ? '?' + q : ''}`;
  });
  mount();
}
