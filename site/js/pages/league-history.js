// League History tab: every past season pulled from ESPN (site/data/history.json).
// #/league-history shows champions, all-time standings and the record book;
// #/league-history/<year> shows one season's final standings and playoff results.
import { h, f1, section, sortableTable } from '../ui.js';
import { allTime, recordBook, seasonSummary } from '../history-stats.js';

const rec = r => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`;
const pct = p => p.toFixed(3).replace(/^0/, '');
const yearLink = y => h('a', { href: `#/league-history/${y}` }, String(y));

export function renderLeagueHistory(ctx, hist, year) {
  const seasons = [...(hist?.seasons || [])].sort((a, b) => b.season - a.season);
  const head = h('h1', {}, 'League History');
  if (!seasons.length) {
    return h('div', {}, head,
      h('p', { class: 'dek' }, 'Past seasons come straight from ESPN Fantasy.'),
      section('Not loaded yet', null, h('p', { class: 'note' },
        hist === null ? 'Could not load the league history. Try again in a moment.'
          : 'The league history is pulled from ESPN on the next site update and then kept here for good. Check back shortly.')));
  }
  const first = seasons[seasons.length - 1].season, last = seasons[0].season;
  const sel = h('select', { 'aria-label': 'Season', onchange: e => { location.hash = e.target.value ? `#/league-history/${e.target.value}` : '#/league-history'; } },
    h('option', { value: '' }, 'All seasons'),
    seasons.map(s => h('option', { value: s.season, selected: s.season === year ? true : null }, `${s.season} season`)));
  const one = seasons.find(s => s.season === year);
  return h('div', {}, head,
    h('p', { class: 'dek' }, `${seasons.length} season${seasons.length === 1 ? '' : 's'} on record (${first === last ? first : `${first}–${last}`}), straight from ESPN Fantasy. ${ctx.data.league.season} lives on the Standings tab until it’s over.`),
    h('div', { class: 'controls' }, 'Show', sel),
    one ? seasonView(one) : overview(ctx, hist, seasons));
}

function overview(ctx, hist, seasons) {
  return h('div', {}, championsCard(seasons), allTimeCard(ctx, hist), recordsCard(hist));
}

function championsCard(seasons) {
  const rows = seasons.map(s => {
    const sum = seasonSummary(s);
    const name = id => s.teams.find(t => t.id === id)?.name ?? '–';
    const fin = sum.final;
    const score = fin && fin.win ? `${f1(Math.max(fin.hp, fin.ap))}–${f1(Math.min(fin.hp, fin.ap))}` : '';
    return h('tr', {},
      h('td', {}, yearLink(s.season)),
      h('td', { class: 'stick' }, s.champion != null ? h('b', {}, '🏆 ', name(s.champion)) : h('span', { class: 'muted' }, 'Not finished')),
      h('td', {}, s.runnerUp != null ? name(s.runnerUp) : '–'),
      h('td', { class: 'num' }, score),
      h('td', {}, sum.regTop ? `${sum.regTop.name} (${rec(sum.regTop)})` : '–'));
  });
  return section('Hall of Champions', 'Every title game on record. Tap a year for that season.',
    h('div', { class: 'tablewrap' }, h('table', { class: 'data hof' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Year'), h('th', { class: 'stick' }, 'Champion'), h('th', {}, 'Runner-up'), h('th', { class: 'num' }, 'Final'), h('th', {}, 'Best regular season'))),
      h('tbody', {}, rows))));
}

function allTimeCard(ctx, hist) {
  // Show each franchise under its current name when it is still in the league.
  const rows = allTime(hist).map(r => ({ ...r, name: ctx.byRid[r.id]?.name ?? r.name }));
  return section('All-time standings', 'Regular-season records across every past season. Teams are matched by their ESPN team slot and shown with this season’s name.',
    sortableTable({
      rows, sortKey: 'titles', stickyIndex: 0,
      columns: [
        { key: 'name', label: 'Team', sort: r => r.name, cell: r => h('span', { class: 'nm' }, r.name), firstDesc: false },
        { key: 'titles', label: 'Titles', align: 'num', sort: r => r.titles * 1000 + r.finals * 10 + r.pct, cell: r => (r.titles ? h('span', { title: r.titleYears.join(', ') }, '🏆'.repeat(Math.min(r.titles, 3)) + (r.titles > 3 ? ` ×${r.titles}` : '')) : '–') },
        { key: 'finals', label: 'Finals', align: 'num', sort: r => r.finals, cell: r => String(r.finals) },
        { key: 'playoffs', label: 'Playoffs', align: 'num', sort: r => r.playoffs, cell: r => String(r.playoffs), title: 'Seasons in the title bracket' },
        { key: 'seasons', label: 'Yrs', align: 'num', sort: r => r.seasons, cell: r => String(r.seasons), title: 'Seasons played' },
        { key: 'rec', label: 'W-L', align: 'num', sort: r => r.w + r.t / 2, cell: r => rec(r) },
        { key: 'pct', label: 'Win %', align: 'num', sort: r => r.pct, cell: r => pct(r.pct) },
        { key: 'pf', label: 'PF', align: 'num', sort: r => r.pf, cell: r => Math.round(r.pf).toLocaleString() },
        { key: 'pa', label: 'PA', align: 'num', sort: r => r.pa, cell: r => Math.round(r.pa).toLocaleString() },
      ],
    }));
}

function recordsCard(hist) {
  const rb = recordBook(hist);
  const when = x => `${x.season}, ${x.po ? 'playoffs' : 'Week'} ${x.po ? `(Week ${x.week})` : x.week}`;
  const tile = (k, v, d) => h('div', { class: 'tile' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  const tiles = [
    rb.high && tile('Highest score', f1(rb.high.pts), `${rb.high.name} vs ${rb.high.oppName}, ${when(rb.high)}`),
    rb.low && tile('Lowest score', f1(rb.low.pts), `${rb.low.name} vs ${rb.low.oppName}, ${when(rb.low)}`),
    rb.blowout && tile('Biggest blowout', `+${f1(rb.blowout.margin)}`, `${rb.blowout.name} ${f1(rb.blowout.pts)}, ${rb.blowout.oppName} ${f1(rb.blowout.oppPts)}, ${when(rb.blowout)}`),
    rb.closest && tile('Closest game', `+${rb.closest.margin.toFixed(2)}`, `${rb.closest.name} ${f1(rb.closest.pts)}, ${rb.closest.oppName} ${f1(rb.closest.oppPts)}, ${when(rb.closest)}`),
    rb.bestSeason && tile('Best record', rec(rb.bestSeason), `${rb.bestSeason.name}, ${rb.bestSeason.season}`),
    rb.mostPoints && tile('Most points in a season', Math.round(rb.mostPoints.pf).toLocaleString(), `${rb.mostPoints.name}, ${rb.mostPoints.season} regular season`),
  ].filter(Boolean);
  const top = rb.topScores.map((x, i) => h('tr', {},
    h('td', { class: 'num' }, String(i + 1)), h('td', { class: 'stick' }, x.name), h('td', { class: 'num' }, h('b', {}, f1(x.pts))),
    h('td', {}, `vs ${x.oppName} (${f1(x.oppPts)})`), h('td', {}, when(x))));
  return section('Record book', 'Every game on record, playoffs included. Team names are as they were that season.',
    h('div', { class: 'tiles' }, tiles),
    top.length ? h('h3', { class: 'rb-h' }, 'Top 10 scores') : null,
    top.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'data' },
      h('thead', {}, h('tr', {}, h('th', { class: 'num' }, '#'), h('th', { class: 'stick' }, 'Team'), h('th', { class: 'num' }, 'Pts'), h('th', {}, 'Opponent'), h('th', {}, 'When'))),
      h('tbody', {}, top))) : null);
}

function seasonView(s) {
  const sum = seasonSummary(s);
  const name = id => s.teams.find(t => t.id === id)?.name ?? `Team ${id}`;
  const byFinish = sum.finalRank;
  const rows = byFinish ? s.teams.slice().sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)) : sum.standings;
  const standings = section(`${s.season} final standings`,
    `${byFinish ? 'Order is ESPN’s final finish, playoffs included.' : 'Ordered by playoff seed.'} Records are regular season${s.regularWeeks ? ` (${s.regularWeeks} weeks)` : ''}.`,
    h('div', { class: 'tablewrap' }, h('table', { class: 'data' },
      h('thead', {}, h('tr', {}, h('th', { class: 'num' }, byFinish ? 'Finish' : '#'), h('th', { class: 'stick' }, 'Team'), h('th', { class: 'num' }, 'W-L'),
        h('th', { class: 'num' }, 'PF'), h('th', { class: 'num' }, 'PA'), h('th', { class: 'num' }, 'Seed'))),
      h('tbody', {}, rows.map((t, i) => h('tr', { class: t.id === s.champion ? 'hist-champ' : '' },
        h('td', { class: 'num' }, String(byFinish ? (t.rank ?? '–') : i + 1)),
        h('td', { class: 'stick' }, t.id === s.champion ? h('b', {}, '🏆 ', t.name) : t.name),
        h('td', { class: 'num' }, rec(t)), h('td', { class: 'num' }, f1(t.pf)), h('td', { class: 'num' }, f1(t.pa)),
        h('td', { class: 'num' }, t.seed ? String(t.seed) : '–')))))));
  const n = sum.playoffRounds.length;
  const roundName = i => (i === n - 1 ? 'Championship' : i === n - 2 ? 'Semifinals' : i === n - 3 ? 'Quarterfinals' : `Round ${i + 1}`);
  const game = g => {
    const side = (id, pts) => h('div', { class: 'bk-team' + (g.win === id ? ' won' : g.win ? ' lost' : '') },
      h('span', { class: 'sd' }, s.teams.find(t => t.id === id)?.seed ?? ''), h('span', { class: 'nm' }, name(id)), h('span', { class: 'pt' }, f1(pts)));
    return h('div', { class: 'bk-game' }, side(g.h, g.hp), side(g.a, g.ap));
  };
  const playoffs = n ? section(`${s.season} playoffs`, 'Title bracket only; consolation games are left out.',
    h('div', { class: 'bracket', style: `--rounds: ${n}` }, sum.playoffRounds.map((r, i) => h('div', { class: 'bk-round' },
      h('div', { class: 'bk-head' }, h('b', {}, roundName(i)), h('span', {}, `Week ${r.week}`)),
      h('div', { class: 'bk-games' }, r.games.map(game)))))) : null;
  return h('div', {},
    s.champion != null ? h('div', { class: 'champ' }, h('span', { class: 'kicker' }, `${s.season} Champion`), h('b', {}, name(s.champion))) : null,
    playoffs, standings,
    h('p', { class: 'note' }, h('a', { href: '#/league-history' }, '← All seasons')));
}
