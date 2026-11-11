import * as A from '../analytics.js';
import { h, f1 } from '../ui.js';
import { powerRankings, streaks } from '../insights.js';

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

// Weeks still to be played, from ESPN's schedule: the current week before kickoff plus every later
// regular-season week. Each game is [ridA, ridB] with ESPN's projection when it has one.
export function futureWeeks(ctx) {
  const played = new Set(weeksWithGames(ctx).map(w => w.week));
  const out = [];
  for (const w of ctx.data.weeks) {
    if (played.has(w.week) || w.complete) continue;
    out.push({ week: w.week, games: w.matchups.filter(m => m.teams.length === 2).map(m => m.teams.map(t => ({ rid: t.rid, proj: t.proj ?? null }))) });
  }
  for (const u of ctx.data.upcoming || []) if (!out.some(o => o.week === u.week)) out.push({ week: u.week, games: u.games.map(g => g.map(rid => ({ rid, proj: null }))) });
  return out.sort((a, b) => a.week - b.week);
}

function upcomingCard(ctx, fw, g, extra) {
  const [a, b] = g;
  const met = ctx.completed.filter(w => ctx.opp[w]?.[a.rid] === b.rid);
  const side = t => h('div', { class: 'game-team' + (t.rid === ctx.meRid ? ' me' : '') },
    h('span', { class: 'nm' }, ctx.name(t.rid)),
    h('span', { class: 'sc' + (t.proj != null ? ' proj' : '') }, t.proj != null ? f1(t.proj) : ''),
    h('span', { class: 'rec' }, extra.recs[t.rid] || ''),
    h('div', { class: 'tops' }, `#${extra.power[t.rid]} in power · streak ${extra.sk[t.rid].label}`));
  const series = met.map(w => `Week ${w}: ${ctx.name(ctx.score[w][a.rid] > ctx.score[w][b.rid] ? a.rid : b.rid)} won ${f1(Math.max(ctx.score[w][a.rid], ctx.score[w][b.rid]))}–${f1(Math.min(ctx.score[w][a.rid], ctx.score[w][b.rid]))}`);
  return h('article', { class: 'game upcoming' },
    h('div', { class: 'game-status' }, a.proj != null ? `Week ${fw.week} · ESPN projection` : `Week ${fw.week} · upcoming`),
    side(a), side(b),
    series.length ? h('div', { class: 'game-foot' }, series.join(' · ')) : null);
}

function restOfSeason(ctx, future, extra) {
  return h('div', { class: 'rest' }, future.map(fw => h('section', { class: 'card rest-week' },
    h('h2', {}, h('a', { href: `#/scores/${fw.week}` }, `Week ${fw.week}`)),
    h('ul', {}, fw.games.map(([a, b]) => h('li', { class: [a.rid, b.rid].includes(ctx.meRid) ? 'mine' : '' },
      h('span', { class: a.rid === ctx.meRid ? 'me' : '' }, ctx.name(a.rid)), h('small', {}, ` ${extra.recs[a.rid]}`),
      h('i', {}, 'vs'),
      h('span', { class: b.rid === ctx.meRid ? 'me' : '' }, ctx.name(b.rid)), h('small', {}, ` ${extra.recs[b.rid]}`)))))));
}

export function renderScores(ctx, state, rerender) {
  const entries = weeksWithGames(ctx);
  const future = futureWeeks(ctx);
  const arg = location.hash.split('/')[2] || '';
  const fromHash = +arg || 0;
  const isRest = arg === 'rest';
  const fw = future.find(f => f.week === fromHash);
  const wk = isRest ? null : fw ? fw.week : entries.find(e => e.week === fromHash) ? fromHash : (state.scoresWeek ?? entries[entries.length - 1]?.week ?? future[0]?.week);
  const entry = entries.find(e => e.week === wk);
  const futureSel = fw || (!entry && !isRest ? future.find(f => f.week === wk) : null);
  const sel = h('select', { 'aria-label': 'Week', onchange: e => { location.hash = `#/scores/${e.target.value}`; } },
    future.length ? h('optgroup', { label: 'Coming up' },
      h('option', { value: 'rest', selected: isRest ? true : null }, 'Rest of the season'),
      future.map(f => h('option', { value: f.week, selected: !isRest && f.week === wk ? true : null }, `Week ${f.week}`))) : null,
    entries.length ? h('optgroup', { label: 'Played' },
      entries.slice().reverse().map(e => h('option', { value: e.week, selected: !isRest && e.week === wk ? true : null }, `Week ${e.week}${e.complete ? '' : ' (live)'}`))) : null);
  const controls = h('div', { class: 'controls', style: { margin: '0 0 14px' } }, sel,
    future.length && !isRest ? h('a', { class: 'btn', href: '#/scores/rest' }, 'Rest of the season') : null);
  const last = ctx.completed[ctx.completed.length - 1];
  const extra = () => ({
    recs: Object.fromEntries(A.standings(ctx).map(r => [r.rid, A.fmtRec(r)])),
    power: last != null ? Object.fromEntries(powerRankings(ctx, last).rows.map(r => [r.rid, r.rank])) : {},
    sk: streaks(ctx),
  });
  if (isRest) {
    return h('div', {},
      h('h1', {}, 'Rest of the Season'),
      h('p', { class: 'dek' }, `Every remaining regular-season matchup, from ESPN’s schedule. Records are as of today.`),
      controls, restOfSeason(ctx, future, extra()));
  }
  if (futureSel) {
    const ex = extra();
    return h('div', {},
      h('h1', {}, `Week ${futureSel.week} Matchups`),
      h('p', { class: 'dek' }, futureSel.games.some(g => g[0].proj != null) ? 'Not started yet. Numbers are ESPN’s projected points for each starting lineup.' : 'Not started yet. Matchups from ESPN’s schedule; projections appear the week of the games.'),
      controls,
      h('div', { class: 'games' }, futureSel.games.map(g => upcomingCard(ctx, futureSel, g, ex))));
  }
  if (!entry) return h('div', {}, h('h1', {}, 'Scores'), h('p', { class: 'empty' }, 'No games have been played yet.'));
  const recs = recordThrough(ctx, wk);
  return h('div', {},
    h('h1', {}, `Week ${wk} Scoreboard`),
    h('p', { class: 'dek' }, entry.complete ? 'Final scores with each team’s top three starters.' : 'Live scores as of the last update. Final once Monday night is in the books.'),
    controls,
    h('div', { class: 'games' }, entry.matchups.filter(m => m.teams.length === 2).map(m => gameCard(ctx, entry, m, recs))));
}
