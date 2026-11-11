import * as A from '../analytics.js';
import { h, f1, signed } from '../ui.js';
import { excerpt } from '../markdown.js';
import { weekStory, streaks, powerIndex } from '../insights.js';
import { byTheNumbers } from './reports.js';
import { newsList, submitBox } from './news.js';

// Front page: lead story, the week in numbers, news, and a sidebar with standings and power index.
export function renderHome(ctx, content) {
  const last = ctx.completed[ctx.completed.length - 1];
  return h('div', { class: 'layout' },
    h('div', {}, leadStory(ctx, content, last), byTheNumbers(ctx, last), newsCard(content), leadersCard(ctx)),
    h('aside', {}, standingsCard(ctx), powerCard(ctx)));
}

function leadStory(ctx, content, last) {
  const r = (content.reports || [])[0];
  if (r) {
    return h('a', { class: 'lead', href: `#/reports/${r.id}`, style: { display: 'block' } },
      h('div', { class: 'kicker' }, r.week ? `Week ${r.week} Report` : 'Weekly Report'),
      h('h3', {}, r.title),
      h('p', {}, excerpt(r.body, 240)),
      h('span', { class: 'more' }, 'Read the full report →'));
  }
  // No report yet: lead with an automatic recap of the latest week.
  const s = last != null ? weekStory(ctx, last) : null;
  if (!s) {
    return h('div', { class: 'lead' }, h('div', { class: 'kicker' }, 'Preseason'), h('h3', {}, 'Kickoff is coming'),
      h('p', {}, 'Scores and standings appear here once Week 1 is in the books.'));
  }
  const st = A.standings(ctx);
  return h('div', { class: 'lead' },
    h('div', { class: 'kicker' }, `Week ${last} Recap`),
    h('h3', {}, `${ctx.name(s.top.rid)} drops ${f1(s.top.pts)} to lead Week ${last}`),
    h('p', {}, `${ctx.name(st[0].rid)} sits atop the league at ${A.fmtRec(st[0])}. ` +
      `${ctx.name(s.blowout.winner)} rolled ${ctx.name(s.blowout.loser)} by ${f1(s.blowout.margin)}, while ` +
      `${ctx.name(s.closest.winner)} survived ${ctx.name(s.closest.loser)} by just ${f1(s.closest.margin)}.`),
    h('a', { class: 'more', href: `#/scores/${last}` }, 'Full scoreboard →'));
}

function newsCard(content) {
  const news = (content.news || []).slice(0, 5);
  return h('section', { class: 'card' },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
      h('h2', {}, 'League News'), submitBox(content, true)),
    newsList(news),
    (content.news || []).length > 5 ? h('a', { class: 'more', href: '#/news' }, 'More news →') : null);
}

function leadersCard(ctx) {
  if (!ctx.completed.length) return null;
  const sm = A.summary(ctx);
  const topPf = sm.slice().sort((a, b) => b.pf - a.pf)[0];
  const lucky = sm.slice().sort((a, b) => b.luck - a.luck)[0];
  const unlucky = sm.slice().sort((a, b) => a.luck - b.luck)[0];
  let best = { pts: -1 };
  for (const w of ctx.completed) for (const rid of ctx.rids) if (ctx.score[w][rid] > best.pts) best = { pts: ctx.score[w][rid], rid, week: w };
  const tile = (k, v, d) => h('div', { class: 'tile' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  return h('section', { class: 'card' },
    h('h2', {}, 'Season leaders'),
    h('div', { class: 'tiles four' },
      tile('Most points', ctx.name(topPf.rid), `${f1(topPf.pf)} PF`),
      tile('Season high', ctx.name(best.rid), `${f1(best.pts)} in Week ${best.week}`),
      tile('Luckiest', ctx.name(lucky.rid), `${signed(lucky.luck)} wins vs. average schedule`),
      tile('Unluckiest', ctx.name(unlucky.rid), `${signed(unlucky.luck)} wins vs. average schedule`)),
    h('a', { class: 'more', href: '#/stats' }, 'Open the Stats Lab →'));
}

function standingsCard(ctx) {
  const st = A.standings(ctx);
  const sk = streaks(ctx);
  return h('section', { class: 'card' },
    h('h2', {}, 'Standings'),
    h('table', { class: 'compact' },
      h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Team'), h('th', { class: 'c' }, 'W-L'), h('th', { class: 'r' }, 'PF'), h('th', { class: 'c' }, 'Strk'))),
      h('tbody', {}, st.map(r => h('tr', { class: r.rid === ctx.meRid ? 'mine' : '' },
        h('td', { class: 'rk' }, r.rank),
        h('td', { class: 'nm' + (r.rid === ctx.meRid ? ' me' : '') }, ctx.name(r.rid)),
        h('td', { class: 'c' }, A.fmtRec(r)),
        h('td', { class: 'r' }, f1(r.pf)),
        h('td', { class: 'c' }, h('span', { class: 'streak ' + (sk[r.rid].kind || '') }, sk[r.rid].label)))))),
    h('a', { class: 'more', href: '#/standings' }, 'Full standings →'));
}

function powerCard(ctx) {
  if (!ctx.completed.length) return null;
  const pi = powerIndex(ctx);
  const mv = m => (m > 0 ? h('span', { class: 'mv up' }, `▲${m}`) : m < 0 ? h('span', { class: 'mv down' }, `▼${-m}`) : h('span', { class: 'mv flat' }, '–'));
  return h('section', { class: 'card' },
    h('h2', {}, 'Power index'),
    h('p', { class: 'sub' }, 'Ranked by all-play record: every team against every team, every week. Arrows show the move since last week.'),
    h('table', { class: 'compact' },
      h('tbody', {}, pi.map(r => h('tr', { class: r.rid === ctx.meRid ? 'mine' : '' },
        h('td', { class: 'rk' }, r.rank),
        h('td', { class: 'nm' + (r.rid === ctx.meRid ? ' me' : '') }, ctx.name(r.rid)),
        h('td', { class: 'c' }, A.fmtRec(r.rec)),
        h('td', { class: 'r' }, mv(r.move)))))));
}
