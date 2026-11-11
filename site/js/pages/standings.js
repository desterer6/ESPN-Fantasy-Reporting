import * as A from '../analytics.js';
import { h, f1, signed, section, sortableTable } from '../ui.js';
import { streaks } from '../insights.js';
import { label } from './common.js';
import { regularSeasonDone } from '../playoffs.js';

export function renderStandings(ctx) {
  const last = ctx.completed[ctx.completed.length - 1];
  const sm = A.summary(ctx);
  const byRid = r => sm.find(x => x.rid === r);
  const st = A.standings(ctx);
  const sk = streaks(ctx);
  const table = sortableTable({
    sortKey: 'rank', desc: false, stickyIndex: 1,
    rowClass: r => (r.rid === ctx.meRid ? 'mine' : ''),
    rows: st,
    columns: [
      { key: 'rank', label: '#', align: 'c', firstDesc: false, sort: r => r.rank, cell: r => r.rank },
      { key: 'team', label: 'Team', firstDesc: false, sort: r => ctx.name(r.rid).toLowerCase(), cell: r => label(ctx, r.rid) },
      { key: 'rec', label: 'W-L', align: 'c', sort: r => A.winsOf(r) * 1000 + r.pf / 100, cell: r => A.fmtRec(r) },
      { key: 'pf', label: 'PF', align: 'r', sort: r => r.pf, cell: r => f1(r.pf) },
      { key: 'pa', label: 'PA', align: 'r', sort: r => r.pa, cell: r => f1(r.pa) },
      { key: 'diff', label: 'Diff', align: 'r', sort: r => r.pf - r.pa, cell: r => signed(r.pf - r.pa) },
      { key: 'strk', label: 'Strk', align: 'c', sort: r => (sk[r.rid].kind === 'W' ? 1 : -1) * sk[r.rid].n, cell: r => h('span', { class: 'streak ' + (sk[r.rid].kind || '') }, sk[r.rid].label) },
      { key: 'oth', label: 'All-play', align: 'c', title: 'Record if you played every team every week', sort: r => byRid(r.rid).winPctOthers, cell: r => A.fmtRec(byRid(r.rid).others) },
      { key: 'luck', label: 'Luck', align: 'r', title: 'Actual wins minus expected wins on an average schedule', sort: r => byRid(r.rid).luck, cell: r => signed(byRid(r.rid).luck) },
    ],
  });
  return h('div', {},
    h('h1', {}, 'Standings'),
    h('p', { class: 'dek' }, last ? `Through Week ${last} of the ${ctx.data.league.season} regular season (${ctx.data.league.regularSeasonEnd} weeks).` : 'No completed weeks yet.'),
    h('nav', { class: 'sub' }, h('a', { href: '#/standings', class: 'on' }, 'League table'), h('a', { href: '#/power' }, 'Power rankings'), h('a', { href: '#/playoffs' }, regularSeasonDone(ctx) ? 'Playoffs' : 'Projected playoffs')),
    section('League table', 'Tap a column to sort. All-play is the record a team would have playing everyone every week; Luck compares real wins with that.', table));
}
