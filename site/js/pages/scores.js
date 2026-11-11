import * as A from '../analytics.js';
import { h, f1 } from '../ui.js';

const weeksWithGames = ctx => ctx.data.weeks.filter(w => w.matchups.some(m => m.teams.some(t => t.pts > 0)));
const latestEntry = ctx => { const ws = weeksWithGames(ctx); return ws[ws.length - 1] || null; };

// Record going into (and including) a given week, from completed weeks only.
const recordThrough = (ctx, w) => Object.fromEntries(A.standings(ctx, ctx.completed.filter(x => x <= w)).map(r => [r.rid, A.fmtRec(r)]));

const statusOf = entry => (entry.complete ? 'Final' : 'Live');

// Compact strip under the masthead: the latest week, like a sports site's scoreboard bar.
export function scoreStrip(ctx) {
  const entry = latestEntry(ctx);
  if (!entry) return null;
  const head = h('div', { class: 'ss-head' }, h('span', {}, entry.complete ? 'Final' : 'Live'), h('b', {}, `Week ${entry.week}`));
  const games = entry.matchups.filter(m => m.teams.length === 2).map(m => {
    const [a, b] = m.teams.slice().sort((x, y) => y.pts - x.pts);
    const row = (t, lose) => h('div', { class: 'ss-row' + (lose && entry.complete ? ' lose' : '') + (t.rid === ctx.meRid ? ' me' : '') },
      h('span', {}, ctx.name(t.rid)), h('span', { class: 'pts' }, f1(t.pts)));
    return h('a', { class: 'ss-game', href: `#/scores/${entry.week}` },
      h('div', { class: 'ss-status' + (entry.complete ? '' : ' live') }, statusOf(entry)), row(a, false), row(b, true));
  });
  return [head, ...games];
}

function topStarters(ctx, t, n = 3) {
  return (t.starters || []).slice().sort((a, b) => b.pts - a.pts).slice(0, n)
    .map(s => ({ name: ctx.players[s.id]?.n || s.id, pos: ctx.players[s.id]?.p || '', pts: s.pts }));
}

export function gameCard(ctx, entry, m, recs) {
  const [a, b] = m.teams.slice().sort((x, y) => y.pts - x.pts);
  const side = (t, lose) => h('div', { class: 'game-team' + (lose && entry.complete ? ' lose' : '') + (t.rid === ctx.meRid ? ' me' : '') },
    h('span', { class: 'nm' }, ctx.name(t.rid)),
    h('span', { class: 'sc' }, f1(t.pts)),
    h('span', { class: 'rec' }, recs[t.rid] || ''),
    h('div', { class: 'tops' }, topStarters(ctx, t).map((p, i) => [i ? ' · ' : '', h('b', {}, p.name), ` ${p.pos} ${f1(p.pts)}`])));
  const margin = a.pts - b.pts;
  return h('article', { class: 'game' },
    h('div', { class: 'game-status' + (entry.complete ? '' : ' live') },
      entry.complete ? `Final · margin ${f1(margin)}` : 'Live · in progress'),
    side(a, false), side(b, true));
}

export function renderScores(ctx, state, rerender) {
  const entries = weeksWithGames(ctx);
  const fromHash = +(location.hash.split('/')[2] || 0);
  const wk = entries.find(e => e.week === fromHash) ? fromHash : (state.scoresWeek ?? entries[entries.length - 1]?.week);
  const entry = entries.find(e => e.week === wk);
  const sel = h('select', { 'aria-label': 'Week', onchange: e => { location.hash = `#/scores/${e.target.value}`; } },
    entries.slice().reverse().map(e => h('option', { value: e.week, selected: e.week === wk ? true : null }, `Week ${e.week}${e.complete ? '' : ' (live)'}`)));
  if (!entry) return h('div', {}, h('h1', {}, 'Scores'), h('p', { class: 'empty' }, 'No games have been played yet.'));
  const recs = recordThrough(ctx, wk);
  return h('div', {},
    h('h1', {}, `Week ${wk} Scoreboard`),
    h('p', { class: 'dek' }, entry.complete ? 'Final scores with each team’s top three starters.' : 'Live scores as of the last update. Final once Monday night is in the books.'),
    h('div', { class: 'controls', style: { margin: '0 0 14px' } }, sel),
    h('div', { class: 'games' }, entry.matchups.filter(m => m.teams.length === 2).map(m => gameCard(ctx, entry, m, recs))));
}
