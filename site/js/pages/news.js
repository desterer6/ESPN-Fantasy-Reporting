import { h } from '../ui.js';
import { seasonTrades, seasonLabel } from '../trades.js';

export const fmtDate = d => (d ? new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '');

export function submitBox(content, compact = false) {
  if (!content.newsFormUrl) return h('p', { class: 'note' }, 'Story submissions open soon.');
  return h('div', { class: compact ? '' : 'card' },
    compact ? null : h('h2', {}, 'Got a story?'),
    compact ? null : h('p', { class: 'sub' }, 'Trades, trash talk, bold predictions. Send it in; the commissioner reviews every story before it runs.'),
    h('a', { class: 'btn-primary', href: content.newsFormUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Submit a story ↗'));
}

export function newsList(items) {
  if (!items.length) return h('p', { class: 'empty' }, 'No stories yet. Be the first to submit one.');
  return h('ul', { class: 'hl' }, items.map(n => h('li', {}, h('a', { href: `#/news/${n.id}` },
    h('div', { class: 't' }, n.headline),
    h('div', { class: 'm' }, [n.byline ? `By ${n.byline}` : 'League desk', n.date ? fmtDate(n.date) : null].filter(Boolean).join(' · '))))));
}

const STATUS_LABEL = { pending: 'Pending vote', done: 'Official', vetoed: 'Vetoed' };

// Compact list of every trade this season (from ESPN), at the top of the Reports tab. The title follows the
// league's season, so it rolls over to the next season on its own.
export function tradesCard(ctx, content) {
  if (!ctx) return null;
  const trades = seasonTrades(ctx, content);
  const label = seasonLabel(ctx.data?.league?.season);
  return h('section', { class: 'card trades-card' },
    h('h2', {}, `${label ? `${label} ` : ''}Trade Reports`),
    trades.length
      ? h('ul', { class: 'trades' }, trades.map(t => h('li', {}, h('a', { href: t.href },
          h('div', { class: 'tr-top' },
            h('span', { class: 'tr-date' }, fmtDate(t.date)),
            h('span', { class: `tr-status ${t.status}` }, STATUS_LABEL[t.status] || STATUS_LABEL.pending)),
          ...t.sides.map(s => h('div', { class: 'tr-side' },
            h('strong', {}, s.name), ' gets ', s.gets.length ? s.gets.join(', ') : 'no players')))))) 
      : h('p', { class: 'empty' }, 'No trades yet this season.'),
    h('p', { class: 'note' }, 'Pulled from ESPN automatically. Draft picks are not tracked by ESPN, so see the story for the full terms.'));
}

export function renderNews(content, id) {
  const news = content.news || [];
  const story = id && news.find(n => n.id === id);
  if (story) {
    return h('article', { class: 'article' },
      h('div', { class: 'kicker', style: { marginTop: '22px' } }, 'League News'),
      h('h1', {}, story.headline),
      h('div', { class: 'byline' }, [story.byline ? `By ${story.byline}` : 'League desk', fmtDate(story.date)].filter(Boolean).join(' · ')),
      // Plain text only: each paragraph becomes a text node, never HTML.
      h('div', { class: 'prose' }, (story.story || '').split(/\n{2,}/).map(p => h('p', {}, p))),
      h('a', { class: 'more', href: '#/news' }, '← All news'));
  }
  return h('div', {},
    h('h1', {}, 'League News'),
    h('p', { class: 'dek' }, 'Stories from around the league, submitted by members and approved by the commissioner.'),
    h('div', { class: 'layout' },
      h('div', {}, h('section', { class: 'card' }, h('h2', {}, 'Latest'), newsList(news))),
      h('aside', {}, submitBox(content))));
}
