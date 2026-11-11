import { h } from '../ui.js';

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
