import * as A from '../analytics.js';
import { h, f1, section, sortableTable } from '../ui.js';
import { label } from './common.js';
import { playoffSize, relegationCount, relegationStatus, currentSeeds, clinchStatus, playoffOdds, bracket, regularSeasonDone, remainingGames } from '../playoffs.js';

const pctText = p => (p >= 0.995 && p < 1 ? '>99%' : p > 0 && p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`);
const weeksText = ws => (ws.length > 1 ? `Weeks ${ws[0]}–${ws[ws.length - 1]}` : `Week ${ws[0]}`);

// Playoffs once the regular season is over; projected playoffs (if the season ended today, plus odds) before that.
export function renderPlayoffs(ctx) {
  const K = playoffSize(ctx);
  const done = regularSeasonDone(ctx);
  const { rows: seeds, source } = currentSeeds(ctx);
  const br = bracket(ctx, seeds);
  const started = br.rounds.some(r => r.games.some(g => g.winner != null || g.live || Object.keys(g.pts).length));
  const champ = br.champion;
  const title = done ? 'Playoffs' : 'Projected Playoffs';
  const last = ctx.completed[ctx.completed.length - 1];
  const dek = done
    ? (champ != null ? `${ctx.name(champ)} won the ${ctx.data.league.season} championship.` : `The ${K}-team field is set. Winners advance; there is no consolation bracket.`)
    : `If the season ended today${last ? ` (after Week ${last})` : ''}. The top ${K} make it; there is no consolation bracket. Regular season ends after Week ${ctx.data.league.regularSeasonEnd}.`;

  return h('div', {},
    h('h1', {}, title),
    h('p', { class: 'dek' }, dek),
    h('nav', { class: 'sub' }, h('a', { href: '#/standings' }, 'League table'), h('a', { href: '#/power' }, 'Power rankings'), h('a', { href: '#/playoffs', class: 'on' }, done ? 'Playoffs' : 'Projected playoffs')),
    champ != null ? h('div', { class: 'champ' }, h('span', { class: 'kicker' }, `${ctx.data.league.season} Champion`), h('b', {}, ctx.name(champ))) : null,
    bracketCard(ctx, br, done, started),
    done ? seedsCard(ctx, seeds, K) : raceCard(ctx, seeds, K, source));
}

function bracketCard(ctx, br, done, started) {
  const team = (slot, g) => {
    if (!slot) return h('div', { class: 'bk-team tbd' }, h('span', { class: 'sd' }, ''), h('span', { class: 'nm' }, 'TBD'), h('span', { class: 'pt' }, ''));
    if (slot.bye) return h('div', { class: 'bk-team tbd' }, h('span', { class: 'sd' }, ''), h('span', { class: 'nm' }, 'Bye'), h('span', { class: 'pt' }, ''));
    if (slot.rid == null) return h('div', { class: 'bk-team tbd' }, h('span', { class: 'sd' }, slot.seed ?? ''), h('span', { class: 'nm' }, slot.from ? `Winner of ${slot.from}` : 'TBD'), h('span', { class: 'pt' }, ''));
    const lost = g.winner != null && g.winner !== slot.rid;
    const pts = g.pts[slot.rid];
    return h('div', { class: 'bk-team' + (g.winner === slot.rid ? ' won' : '') + (lost ? ' lost' : '') + (slot.rid === ctx.meRid ? ' me' : '') },
      h('span', { class: 'sd' }, slot.seed ?? ''), h('span', { class: 'nm' }, ctx.name(slot.rid)), h('span', { class: 'pt' }, pts != null && (pts > 0 || g.winner != null) ? f1(pts) : ''));
  };
  return section(done ? 'Bracket' : 'Projected bracket',
    done ? (started ? 'Scores update with every refresh. Winners advance.' : 'Seeds are locked. Games start next week.') : 'Seeded by today’s standings. Higher seeds sit on top.',
    h('div', { class: 'bracket', style: `--rounds: ${br.rounds.length}` }, br.rounds.map(r => h('div', { class: 'bk-round' },
      h('div', { class: 'bk-head' }, h('b', {}, r.name), h('span', {}, weeksText(r.nflWeeks))),
      h('div', { class: 'bk-games' }, r.games.map(g => h('div', { class: 'bk-game' + (g.live ? ' live' : '') },
        g.live ? h('div', { class: 'bk-live' }, 'Live') : null, team(g.top, g), team(g.bottom, g))))))));
}

function raceCard(ctx, seeds, K, source) {
  const remaining = remainingGames(ctx);
  const status = clinchStatus(ctx, seeds, remaining);
  const { odds, sims } = playoffOdds(ctx);
  const w = r => A.winsOf(r);
  const lineIn = seeds[K] ? w(seeds[K]) : null; // first team out
  const lineOut = seeds[K - 1] ? w(seeds[K - 1]) : null; // last team in
  const line = r => (r.seed <= K ? (lineIn == null ? null : w(r) - lineIn) : w(r) - lineOut);
  const lineText = v => (v == null ? '–' : v === 0 ? '0' : (v > 0 ? '+' : '−') + Math.abs(v).toString().replace(/\.0$/, ''));
  const badge = r => {
    const s = status[r.rid];
    return s === 'clinched' ? h('span', { class: 'pbadge in' }, 'Clinched') : s === 'eliminated' ? h('span', { class: 'pbadge out' }, 'Eliminated') : r.seed <= K ? h('span', { class: 'pbadge maybe' }, 'In for now') : h('span', { class: 'pbadge chase' }, 'Chasing');
  };
  const R = relegationCount(ctx);
  const N = seeds.length;
  const relStatus = relegationStatus(ctx, seeds, remaining);
  const inDrop = r => R > 0 && r.seed > N - R;
  const teamCell = r => [label(ctx, r.rid), inDrop(r) ? h('span', { class: 'rtag', title: `Last place at the end of the regular season is relegated from the league` }, relStatus[r.rid] === 'relegated' ? 'Relegated' : 'Relegation zone') : null];
  const oddsOf = r => (status[r.rid] === 'clinched' ? 1 : status[r.rid] === 'eliminated' ? 0 : odds[r.rid].pct);
  const table = sortableTable({
    sortKey: 'seed', desc: false, stickyIndex: 1,
    rowClass: r => [r.rid === ctx.meRid ? 'mine' : '', r.seed === K + 1 ? 'cut' : '', inDrop(r) ? 'releg' : ''].join(' ').trim(),
    rows: seeds,
    columns: [
      { key: 'seed', label: 'Seed', align: 'c', firstDesc: false, sort: r => r.seed, cell: r => r.seed },
      { key: 'team', label: 'Team', firstDesc: false, sort: r => ctx.name(r.rid).toLowerCase(), cell: teamCell },
      { key: 'rec', label: 'W-L', align: 'c', sort: r => w(r) * 1000 + r.pf / 100, cell: r => A.fmtRec(r) },
      { key: 'odds', label: 'Odds', align: 'r', title: 'Chance to make the playoffs, from simulating the rest of the regular season', sort: r => oddsOf(r), cell: r => h('span', { class: 'odds' }, h('span', { class: 'track' }, h('i', { style: { width: `${Math.round(oddsOf(r) * 100)}%` } })), h('b', {}, pctText(oddsOf(r)))) },
      { key: 'status', label: 'Status', align: 'c', sort: r => ({ clinched: 3, eliminated: 0 }[status[r.rid]] ?? (r.seed <= K ? 2 : 1)), cell: badge },
      { key: 'likely', label: 'Likely seed', align: 'c', title: 'Most common finishing seed in the simulations', sort: r => odds[r.rid].likelySeed ?? 99, cell: r => (odds[r.rid].likelySeed ? `#${odds[r.rid].likelySeed} (${pctText(odds[r.rid].likelySeedPct)})` : '–') },
      { key: 'pf', label: 'PF', align: 'r', sort: r => r.pf, cell: r => f1(r.pf) },
      { key: 'line', label: 'Line', align: 'c', title: `Wins above (+) or below (−) the playoff line: the ${K + 1}th team for teams in, the ${K}th for teams out`, sort: r => line(r), cell: r => lineText(line(r)) },
    ],
  });
  const weeksLeft = new Set(remaining.map(g => g.week)).size;
  let relegNote = null;
  if (R) {
    const risk = seeds.filter(r => relStatus[r.rid] !== 'safe').map(r => ({ r, p: relStatus[r.rid] === 'relegated' ? 1 : odds[r.rid].relegPct }))
      .filter(x => x.p >= 0.005).sort((a, b) => b.p - a.p).slice(0, 3);
    relegNote = h('p', { class: 'releg-note' }, h('b', {}, 'Relegation: '),
      `${R === 1 ? 'Last place' : `The bottom ${R}`} at the end of the regular season ${R === 1 ? 'is' : 'are'} relegated from the league. `,
      risk.length ? `Chance of finishing last: ${risk.map(x => `${ctx.name(x.r.rid)} ${pctText(x.p)}`).join(', ')}.` : '');
  }
  return section('Playoff race',
    `${weeksLeft} regular-season week${weeksLeft === 1 ? '' : 's'} left. The dashed line is the cutoff for the top ${K}. Tap a column to sort.`,
    table,
    relegNote,
    h('p', { class: 'note' },
      `Seeds ${source === 'espn' ? 'come straight from ESPN, using the league’s tiebreakers' : 'are by record, then points for'}. ` +
      `Odds come from playing out the remaining ESPN schedule ${sims.toLocaleString()} times, with each team scoring like it has so far this season (and ESPN’s projections for the current week), ranked by wins and then points. ` +
      'Clinched and Eliminated are certain on wins alone.'));
}

function seedsCard(ctx, seeds, K) {
  const R = relegationCount(ctx), N = seeds.length;
  const down = r => R > 0 && r.seed > N - R;
  return section('Final seeds', 'Regular-season finish. The dashed line is the playoff cutoff.',
    h('div', { class: 'tablewrap' }, h('table', { class: 'compact' },
      h('thead', {}, h('tr', {}, h('th', { class: 'c' }, 'Seed'), h('th', {}, 'Team'), h('th', { class: 'c' }, 'W-L'), h('th', { class: 'r' }, 'PF'), h('th', { class: 'c' }, ''))),
      h('tbody', {}, seeds.map(r => h('tr', { class: [r.rid === ctx.meRid ? 'mine' : '', r.seed === K + 1 ? 'cut' : '', down(r) ? 'releg' : ''].join(' ').trim() },
        h('td', { class: 'c' }, r.seed), h('td', { class: 'nm' }, label(ctx, r.rid), down(r) ? h('span', { class: 'rtag' }, 'Relegated') : null), h('td', { class: 'c' }, A.fmtRec(r)), h('td', { class: 'r' }, f1(r.pf)),
        h('td', { class: 'c' }, r.seed <= K ? h('span', { class: 'pbadge in' }, 'In') : h('span', { class: 'pbadge out' }, 'Out'))))))));
}
