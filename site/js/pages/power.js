import { regularSeasonDone } from '../playoffs.js';
import * as A from '../analytics.js';
import { h, f1, f2, attachTip, esc, sortableTable, section } from '../ui.js';
import { powerRankings, POWER_CATEGORIES } from '../insights.js';
import { label, labelHtml } from './common.js';

// One color per category, used for the score bars and legend.
export const CAT_COLORS = { record: '#d7263d', pf: '#3987e5', recent: '#199e70', roster: '#c98500', pa: '#8e6bd8', lineup: '#7f93a8' };

const rawText = (r, key, pr) => ({
  record: A.fmtRec(r),
  pf: `${f1(r.pf)} PF`,
  recent: `${f1(r.recentAvg)} avg`,
  roster: pr.projAvailable ? (r.proj != null ? `${f1(r.proj)} proj` : 'no projection') : 'not available',
  pa: `${f1(r.pa)} PA`,
  lineup: 'neutral',
}[key]);

const move = m => (m > 0 ? h('span', { class: 'mv up' }, `▲${m}`) : m < 0 ? h('span', { class: 'mv down' }, `▼${-m}`) : h('span', { class: 'mv flat' }, '–'));

// Stacked bar: how much each category contributes to a team's 100-point score.
export function scoreBar(ctx, r, pr) {
  return h('div', { class: 'pbar', role: 'img', 'aria-label': `Power score ${f1(r.score)} of 100` },
    POWER_CATEGORIES.map(c => attachTip(h('div', { style: { width: r.c[c.key] + '%', background: CAT_COLORS[c.key] } }),
      () => `${labelHtml(ctx, r.rid)}<br><b>${esc(c.label)}</b>: ${f2(r.c[c.key])} of ${c.weight}<br><span class="mut">${esc(rawText(r, c.key, pr))}</span>`)));
}

export function renderPower(ctx, state, rerender) {
  const weeks = ctx.completed;
  if (!weeks.length) return h('div', {}, h('h1', {}, 'Power Rankings'), h('p', { class: 'empty' }, 'Rankings start after Week 1.'));
  const week = weeks.includes(state.powerWeek) ? state.powerWeek : weeks[weeks.length - 1];
  const pr = powerRankings(ctx, week);
  const prevIdx = weeks.indexOf(week) - 1;
  const before = prevIdx >= 0 ? Object.fromEntries(powerRankings(ctx, weeks[prevIdx]).rows.map(r => [r.rid, r.rank])) : {};
  const rows = pr.rows.map(r => ({ ...r, move: before[r.rid] ? before[r.rid] - r.rank : 0 }));

  const sel = h('select', { 'aria-label': 'Rankings after week', onchange: e => { state.powerWeek = +e.target.value; rerender(); } },
    weeks.slice().reverse().map(w => h('option', { value: w, selected: w === week ? true : null }, `After Week ${w}`)));

  // Ranked list with stacked score bars, split into tiers.
  const list = h('div', { class: 'plist' }, rows.map((r, i) => [
    i === 0 || rows[i - 1].tier !== r.tier ? h('div', { class: 'ptier' }, `Tier ${r.tier}`) : null,
    h('div', { class: 'prow' + (r.rid === ctx.meRid ? ' mine' : '') },
      h('span', { class: 'prk' }, r.rank),
      h('div', { class: 'pmain' },
        h('div', { class: 'ptop' }, h('span', { class: 'pnm' }, label(ctx, r.rid)), h('span', { class: 'prec' }, A.fmtRec(r)), move(r.move), h('b', { class: 'pscore' }, f1(r.score))),
        scoreBar(ctx, r, pr))),
  ]));

  const legend = h('div', { class: 'legend' }, POWER_CATEGORIES.map(c => h('span', {}, h('i', { style: { background: CAT_COLORS[c.key] } }), `${c.label} (${c.weight})`)));

  const cell = (r, key) => h('div', { class: 'pcell' }, h('b', {}, f1(r.c[key])), h('small', {}, rawText(r, key, pr)));
  const table = sortableTable({
    sortKey: 'rank', desc: false, stickyIndex: 1,
    rowClass: r => (r.rid === ctx.meRid ? 'mine' : ''),
    rows,
    columns: [
      { key: 'rank', label: '#', align: 'c', firstDesc: false, sort: r => r.rank, cell: r => r.rank },
      { key: 'team', label: 'Team', firstDesc: false, sort: r => ctx.name(r.rid).toLowerCase(), cell: r => label(ctx, r.rid) },
      { key: 'score', label: 'Score', align: 'r', sort: r => r.score, cell: r => h('b', {}, f1(r.score)) },
      ...POWER_CATEGORIES.map(c => ({ key: c.key, label: `${c.label} /${c.weight}`, align: 'r', title: c.how, sort: r => r.c[c.key], cell: r => cell(r, c.key) })),
      { key: 'tier', label: 'Tier', align: 'c', sort: r => r.tier, cell: r => r.tier },
    ],
  });

  const how = h('section', { class: 'card' },
    h('h2', {}, 'How the score works'),
    h('p', { class: 'sub' }, 'Every team gets a score out of 100 from six categories. Record counts the most, so winning matters; scoring and form decide the rest. Ranked by score, then record, then points.'),
    h('div', { class: 'phow' }, POWER_CATEGORIES.map(c => h('div', { class: 'phow-row' },
      h('div', { class: 'phow-name' }, h('i', { class: 'sw', style: { background: CAT_COLORS[c.key] } }), c.label),
      h('div', { class: 'phow-pts' }, `${c.weight} pts`),
      h('div', { class: 'phow-how' }, c.how)))),
    h('p', { class: 'note' }, '“Scaled” means compared with the rest of the league: (team − league low) ÷ (league high − league low) × the category’s points. Tiers group teams whose scores are close, split at the biggest gaps.' +
      (pr.projAvailable ? '' : ' ESPN projections for next week weren’t available, so roster strength is 0 for everyone this week.')));

  return h('div', {},
    h('h1', {}, 'Power Rankings'),
    h('p', { class: 'dek' }, `Who’s actually the best team right now, scored out of 100. Tap any bar segment to see where the points come from.`),
    h('nav', { class: 'sub' }, h('a', { href: '#/standings' }, 'League table'), h('a', { href: '#/power', class: 'on' }, 'Power rankings'), h('a', { href: '#/playoffs' }, regularSeasonDone(ctx) ? 'Playoffs' : 'Projected playoffs')),
    h('div', { class: 'controls', style: { margin: '10px 0 6px' } }, sel),
    h('div', { class: 'layout' },
      h('div', {}, section(`Rankings after Week ${week}`, null, legend, list)),
      h('aside', {}, how)),
    section('Full scorecard', 'Points earned in each category, with the number behind it. Tap a column to sort.', table));
}
