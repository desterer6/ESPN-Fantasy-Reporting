import { h, f1 } from '../ui.js';
import { renderMarkdown } from '../markdown.js';
import { weekStory } from '../insights.js';
import { fmtDate } from './news.js';

export function byTheNumbers(ctx, w) {
  const s = w != null && weekStory(ctx, w);
  if (!s) return null;
  const tile = (k, v, d) => h('div', { class: 'tile' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  const mvpName = s.mvp && ctx.players[s.mvp.id] ? ctx.players[s.mvp.id].n : null;
  return h('section', { class: 'card' },
    h('h2', {}, `Week ${w} by the numbers`),
    h('div', { class: 'tiles four' },
      tile('High score', ctx.name(s.top.rid), `${f1(s.top.pts)} points`),
      tile('Biggest blowout', ctx.name(s.blowout.winner), `beat ${ctx.name(s.blowout.loser)} by ${f1(s.blowout.margin)}`),
      tile('Closest game', ctx.name(s.closest.winner), `edged ${ctx.name(s.closest.loser)} by ${f1(s.closest.margin)}`),
      mvpName ? tile('Player of the week', mvpName, `${f1(s.mvp.pts)} for ${ctx.name(s.mvp.rid)}`)
        : tile('Low score', ctx.name(s.low.rid), `${f1(s.low.pts)} points`)));
}

const reportWeek = (ctx, r) => r.week ?? null;

export function renderReports(ctx, content, id) {
  const reports = content.reports || [];
  const r = id ? reports.find(x => x.id === id) : null;
  if (r) {
    return h('div', {},
      h('article', { class: 'article' },
        h('div', { class: 'kicker', style: { marginTop: '22px' } }, (r.week ? `Week ${r.week} Report` : 'Weekly Report') + (r.archived ? ' · From the archive' : '')),
        h('h1', {}, r.title),
        h('div', { class: 'byline' }, ['By the Commissioner', fmtDate(r.date)].filter(Boolean).join(' · ')),
        h('div', { class: 'prose', html: renderMarkdown(r.body) })),
      byTheNumbers(ctx, reportWeek(ctx, r)),
      h('a', { class: 'more', href: '#/reports' }, '← All weekly reports'));
  }
  const last = ctx.completed[ctx.completed.length - 1];
  return h('div', {},
    h('h1', {}, 'Weekly Report'),
    h('p', { class: 'dek' }, 'The commissioner’s recap, posted every Tuesday after Monday Night Football.'),
    h('div', { class: 'layout' },
      h('div', {},
        h('section', { class: 'card' }, h('h2', {}, 'All reports'),
          reports.length ? h('ul', { class: 'hl' }, reports.map(x => h('li', {}, h('a', { href: `#/reports/${x.id}` },
            h('div', { class: 't' }, x.title),
            h('div', { class: 'm' }, [x.week ? `Week ${x.week}` : null, fmtDate(x.date)].filter(Boolean).join(' · '))))))
            : h('p', { class: 'empty' }, 'The first weekly report drops Tuesday after Monday Night Football.'))),
      h('aside', {}, byTheNumbers(ctx, last))));
}
