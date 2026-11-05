import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { SERVICES, GROUPS, CONTACT, CHANNELS, telegramHref } from '../config.js';
import { esc, card, empty } from '../components.js';
import { favIds } from '../store.js';

export function renderSoon(root, serviceId) {
  const svc = SERVICES[serviceId];
  const channel = CHANNELS[serviceId];
  const live = Object.keys(SERVICES).filter(s => SERVICES[s].live);
  root.innerHTML = `
<section class="soon">
  <div class="container">
    <nav class="crumbs"><a href="#/">${t('nav.home')}</a>${icon('right')}<span>${t('group.' + svc.group)}</span></nav>
    <div class="svc-tabs">${GROUPS[svc.group].services.map(s => `<a class="svc-tab${s === serviceId ? ' on' : ''}" href="#/${s}">${icon(SERVICES[s].icon)}${t('svc.' + s + '.short')}${SERVICES[s].live ? '' : `<sup>${t('svc.soon')}</sup>`}</a>`).join('')}</div>
    <div class="soon-hero">
      <div>
        <span class="badge badge-accent">${icon('bell')}${t('soon.badge')}</span>
        <h1>${t('svc.' + serviceId)}</h1>
        <p class="lead">${t('svc.' + serviceId + '.desc')}. ${t(channel ? 'soon.lead.channel' : 'soon.lead')}</p>
        <div class="soon-cta">
          <a class="btn btn-primary btn-lg" href="${telegramHref(CONTACT.telegram)}" target="_blank" rel="noopener" data-lead="telegram">${icon('send')}<span>${t('soon.cta')}</span></a>
          ${channel ? `<a class="btn btn-outline btn-lg" href="${telegramHref(channel)}" target="_blank" rel="noopener">@${esc(channel)}</a>` : ''}
        </div>
      </div>
      <div class="soon-art" aria-hidden="true"><span>${icon(svc.icon)}</span><i></i><i></i><i></i></div>
    </div>
    <div class="soon-grid">
      <div class="soon-card">
        <h2>${t('soon.how')}</h2>
        <ol class="steps">${[1, 2, 3].map(n => `<li><b>${n}</b><span>${t('soon.step.' + n)}</span></li>`).join('')}</ol>
      </div>
      <div class="soon-card">
        <h2>${t('soon.preview')}</h2>
        <div class="chips">${(t('soon.f.' + serviceId) || []).map(f => `<span class="chip ghost">${icon('check')}${esc(f)}</span>`).join('')}</div>
      </div>
    </div>
    <h2 class="soon-more">${t('soon.meanwhile')}</h2>
    <div class="svc-grid">${live.map(s => `
      <a class="svc-tile" href="#/${s}"><span class="svc-ico">${icon(SERVICES[s].icon)}</span><span class="svc-name">${t('svc.' + s)}</span>
      <span class="svc-desc">${t('svc.' + s + '.desc')}</span><span class="svc-meta"><b></b>${icon('arrow')}</span></a>`).join('')}</div>
  </div>
</section>`;
}

export function renderFavorites(root, data) {
  const items = favIds().map(id => data.byId.get(id)).filter(Boolean);
  root.innerHTML = `
<section class="container page-pad">
  <div class="cat-title"><h1>${t('fav.title')}</h1><span class="cat-count">${items.length ? t('cat.count', items.length) : ''}</span></div>
  ${items.length ? `<div class="grid grid-wide">${items.map(x => card(x)).join('')}</div>`
    : empty(t('fav.empty.t'), t('fav.empty.d'), `<a class="btn btn-primary" href="#/rent">${t('fav.browse')}</a>`)}
</section>`;
}

export function renderNotFound(root) {
  root.innerHTML = `<section class="container page-pad">${empty(t('nf.title'), '', `<a class="btn btn-primary" href="#/">${t('nf.home')}</a>`)}</section>`;
}
