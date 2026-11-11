// Tiny, safe Markdown renderer for pasted weekly reports. Everything is HTML-escaped first, then a
// small set of formatting is added back, so pasted text can never inject markup or scripts.
// Supports: # / ## / ### headings, paragraphs, line breaks, - or * or 1. lists, > quotes, --- rules,
// **bold**, *italic* / _italic_, and [links](https://...) (http/https only).

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function inline(text) {
  let s = esc(text);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer nofollow">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/(^|[\s(])_([^_\s][^_]*)_/g, '$1<em>$2</em>');
  return s;
}

export function renderMarkdown(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [], list = null, quote = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}${list.start > 1 ? ` start="${list.start}"` : ''}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`); quote = []; } };
  const flush = () => { flushPara(); flushList(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if (!line.trim()) { flush(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flush(); const n = m[1].length + 1; out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); continue; }
    if ((m = line.match(/^\s*>\s?(.*)$/))) { flushPara(); flushList(); quote.push(m[1]); continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { flushPara(); flushQuote(); if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { flushPara(); flushQuote(); if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [], start: parseInt(line, 10) || 1 }; } list.items.push(m[1]); continue; }
    flushList(); flushQuote();
    para.push(line.trim());
  }
  flush();
  return out.join('\n');
}

// Plain-text excerpt for teasers.
export function excerpt(src, max = 220) {
  const text = String(src || '')
    .replace(/^#{1,3}\s+.*$/gm, '')
    .replace(/<[^>]*>/g, '')
    .replace(/^\s*([-*•]|\d+[.)])\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max).replace(/\s+\S*$/, '') + '…' : text;
}
