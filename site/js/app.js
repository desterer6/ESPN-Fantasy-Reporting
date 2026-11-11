import * as A from './analytics.js';
import { h, hideTip } from './ui.js';
import { tickerItems } from './insights.js';
import { renderHome } from './pages/home.js';
import { renderScores, scoreStrip } from './pages/scores.js';
import { renderStandings } from './pages/standings.js';
import { renderReports } from './pages/reports.js';
import { renderNews } from './pages/news.js';
import { renderPower } from './pages/power.js';
import { renderPlayoffs } from './pages/playoffs.js';
import { renderHistory } from './pages/history.js';
import { renderSchedule } from './pages/schedule.js';
import { renderRoster } from './pages/roster.js';
import { renderLeagueHistory } from './pages/league-history.js';

const app = document.getElementById('app');
const state = { from: null, to: null, scoresWeek: null };
let ctx = null;
let content = { reports: [], news: [], newsFormUrl: '' };
let leagueHist; // league history: undefined until first needed, null if it could not be loaded

function rangeControls() {
  const ws = ctx.completed;
  const from = state.from ?? ws[0], to = state.to ?? ws[ws.length - 1];
  const sel = (value, onchange, label) => h('select', { onchange, 'aria-label': label },
    ws.map(w => h('option', { value: w, selected: w === value ? true : null }, `Week ${w}`)));
  return h('div', { class: 'controls' },
    'Weeks',
    sel(from, e => { state.from = +e.target.value; if (state.to != null && state.to < state.from) state.to = state.from; route(true); }, 'From week'),
    'to',
    sel(to, e => { state.to = +e.target.value; if (state.from != null && state.from > state.to) state.from = state.to; route(true); }, 'To week'),
    h('button', { class: 'btn', onclick: () => { state.from = state.to = null; route(true); } }, 'All'));
}

function statsPage(sub) {
  const tab = (id, text) => h('a', { href: `#/stats/${id}`, class: sub === id ? 'on' : '' }, text);
  const body = sub === 'schedule' ? [rangeControls(), renderSchedule(ctx, state)]
    : sub === 'roster' ? [rangeControls(), renderRoster(ctx, state)]
    : [renderHistory(ctx)];
  return h('div', {},
    h('h1', {}, 'Stats Lab'),
    h('p', { class: 'dek' }, 'Deep dives: how the season unfolded, schedule luck, and how each roster scores.'),
    h('nav', { class: 'sub' }, tab('history', 'This season'), tab('schedule', 'Schedule luck'), tab('roster', 'Roster breakdown')),
    ...body);
}

function route(keepScroll = false) {
  hideTip();
  const y = window.scrollY;
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean).map(decodeURIComponent);
  const page = parts[0] || 'home';
  document.querySelectorAll('[data-tab]').forEach(a => {
    const on = a.dataset.tab === (['power', 'playoffs'].includes(page) ? 'standings' : page);
    a.classList.toggle('on', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
  let view;
  try {
    if (page === 'scores') view = renderScores(ctx, state, () => route(true));
    else if (page === 'standings') view = renderStandings(ctx);
    else if (page === 'playoffs') view = renderPlayoffs(ctx);
    else if (page === 'power') view = renderPower(ctx, state, () => route(true));
    else if (page === 'reports') view = renderReports(ctx, content, parts[1]);
    else if (page === 'news') view = renderNews(content, parts[1]);
    else if (page === 'league-history') {
      if (leagueHist === undefined) {
        view = h('div', { class: 'loading' }, 'Loading league history…');
        loadJson('data/history.json', null).then(x => { leagueHist = x; if (document.body.dataset.page === 'league-history') route(true); });
      } else view = renderLeagueHistory(ctx, leagueHist, Number(parts[1]) || null);
    }
    else if (page === 'stats') view = statsPage(['schedule', 'roster'].includes(parts[1]) ? parts[1] : 'history');
    else view = renderHome(ctx, content);
  } catch (e) {
    console.error(e);
    view = h('div', { class: 'err' }, 'Something went wrong drawing this page: ' + e.message);
  }
  app.replaceChildren(view);
  document.body.dataset.page = page;
  markScrollables();
  if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
}

// Wide tables scroll sideways on small screens: fade the edge and show a hint until the end is reached.
function markScrollables() {
  for (const w of app.querySelectorAll('.tablewrap')) {
    const update = () => {
      const scrolls = w.scrollWidth > w.clientWidth + 4;
      w.classList.toggle('scrolls', scrolls);
      w.classList.toggle('at-end', w.scrollLeft + w.clientWidth >= w.scrollWidth - 4);
      let hint = w.previousElementSibling;
      if (!hint || !hint.classList.contains('swipe-hint')) { hint = h('div', { class: 'swipe-hint', 'aria-hidden': 'true' }, 'Swipe for more →'); w.before(hint); }
      hint.classList.toggle('show', scrolls && !w.classList.contains('at-end'));
    };
    if (!w.dataset.watched) { w.dataset.watched = '1'; w.addEventListener('scroll', update, { passive: true }); new ResizeObserver(update).observe(w); }
    update();
  }
}

// "My team" highlight: chosen per viewer and remembered on this device only.
function setupMePicker(data) {
  const key = 'ffl-me-' + data.league.id;
  let saved = null;
  try { saved = localStorage.getItem(key); } catch {}
  const pick = ctx.teams.find(t => t.teamKey === saved);
  ctx.meRid = pick ? pick.rosterId : null;
  const sel = document.getElementById('me-select');
  sel.replaceChildren(h('option', { value: '' }, 'My team'),
    ...ctx.teams.map(t => h('option', { value: t.teamKey, selected: pick && t.teamKey === pick.teamKey ? true : null }, t.name)));
  sel.onchange = () => {
    const t = ctx.teams.find(x => x.teamKey === sel.value);
    ctx.meRid = t ? t.rosterId : null;
    try { t ? localStorage.setItem(key, t.teamKey) : localStorage.removeItem(key); } catch {}
    drawChrome();
    route(true);
  };
}

function drawTicker() {
  const items = tickerItems(ctx, content);
  const el = document.getElementById('ticker');
  if (!items.length) { el.hidden = true; return; }
  // Team names stand out in bold wherever they appear (headlines, scores, streaks). Longest first so
  // a name that contains another name wins.
  const names = [...new Set(ctx.teams.map(t => t.name).filter(Boolean))].sort((a, b) => b.length - a.length);
  const re = names.length ? new RegExp(`(${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi') : null;
  const withTeams = text => (re ? String(text).split(re).map((part, i) => (i % 2 ? h('strong', { class: 'tm' }, part) : part)) : text);
  const one = () => items.map(it => h('a', { class: 'ticker-item', href: it.href }, h('b', {}, it.tag), h('span', {}, withTeams(it.text))));
  const track = document.getElementById('ticker-track');
  // Two copies so the loop is seamless; the copy is hidden from screen readers.
  track.replaceChildren(h('span', {}, one()), h('span', { 'aria-hidden': 'true' }, one()));
  track.querySelectorAll('[aria-hidden] a').forEach(a => a.setAttribute('tabindex', '-1'));
  track.style.setProperty('--dur', `${Math.max(30, items.length * 7)}s`);
  el.hidden = false;
}

function drawChrome() {
  drawTicker();
  const strip = scoreStrip(ctx);
  const holder = document.getElementById('scorestrip');
  if (strip) { document.getElementById('scorestrip-inner').replaceChildren(...strip); holder.hidden = false; } else holder.hidden = true;
}

async function loadJson(url, fallback) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return await res.json();
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}

async function main() {
  try {
    const [data, c] = await Promise.all([loadJson('data/league.json'), loadJson('data/content.json', null)]);
    if (c) content = c;
    ctx = A.prepare(data);
    setupMePicker(data);
    document.getElementById('league-name').textContent = data.league.name;
    const initials = data.league.name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    if (initials) document.getElementById('logo-text').textContent = initials;
    document.title = `${data.league.name} | League Report`;
    const when = new Date(data.generatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    document.getElementById('updated').textContent = `${data.league.season} · Week ${data.league.currentWeek}`;
    document.getElementById('updated').title = `Updated ${when}`;
    document.getElementById('foot-left').textContent = `Unofficial fan site. Data from ESPN Fantasy, updated ${when}.`;
    drawChrome();
    window.addEventListener('hashchange', () => route());
    // Charts read theme colors when drawn, so redraw on a theme switch.
    document.addEventListener('themechange', () => { drawChrome(); route(true); });
    route();
  } catch (e) {
    console.error(e);
    app.replaceChildren(h('div', { class: 'err' }, 'Could not load league data. ' + e.message));
  }
}
main();

// Offline support: cache the site so it opens instantly and works with no signal (data refreshes when online).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
