// Trades pulled from ESPN (league.json "trades") -> automatic League News stories.
// Pure functions: tests/trades.test.mjs covers them.
//
// A trade the commissioner already wrote up by hand (a news/*.md post with a "trade:" line naming
// the players) is not posted twice: the hand-written story wins.

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const list = xs => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const playerLabel = g => [g.n, [g.t, g.p].filter(x => x && x !== '?').join(' ')].filter(Boolean).join(' (') + (g.t || (g.p && g.p !== '?') ? ')' : '');

const STATUS = {
  pending: {
    tag: 'TRADE ALERT 🚨',
    line: 'The trade has been accepted and now goes to the league vote. Uphold it or veto it in the ESPN app 🗳️👀',
  },
  done: {
    tag: 'TRADE ALERT 🚨',
    line: 'The trade is OFFICIAL. The paperwork has cleared and the new guys are on the roster 🫡',
  },
  vetoed: {
    tag: 'TRADE VETOED 🛑',
    line: 'THE LEAGUE HAS SPOKEN AND THIS TRADE HAS BEEN VETOED ✋🔒 Everybody goes back to their old team like nothing happened.',
  },
};

// Hand-written stories that cover a trade: news posts with a "trade:" line.
const coverage = content => (content.news || []).flatMap(n => (Array.isArray(n.trades) ? n.trades : [])
  .map(names => ({ id: n.id, set: new Set(names.map(norm)) })));
const usableSides = (ctx, tr) => (tr.sides || []).filter(s => ctx.byRid?.[s.rid]);
const playerKeys = sides => sides.flatMap(s => s.gets.map(g => norm(g.n)));
// Same players on both lists (a smaller earlier trade with one of those players still gets its own story).
const coveringStory = (cov, names) => cov.find(c => c.set.size === new Set(names).size && names.every(n => c.set.has(n)));

// "2026" -> "2026-27": the NFL season runs into the next year.
export const seasonLabel = season => {
  const y = parseInt(season, 10);
  return Number.isFinite(y) ? `${y}-${String(y + 1).slice(-2)}` : '';
};

// This season's trades for the News tab, newest first, each linked to its story.
export function seasonTrades(ctx, content = {}) {
  const cov = coverage(content);
  return (ctx?.data?.trades || []).map(tr => {
    const sides = usableSides(ctx, tr);
    const names = playerKeys(sides);
    if (sides.length < 2 || !names.length) return null;
    const story = coveringStory(cov, names);
    return {
      id: tr.id,
      date: tr.date,
      status: tr.status,
      href: `#/news/${story ? story.id : `t-${tr.id}`}`,
      sides: sides.map(s => ({ rid: s.rid, name: ctx.name(s.rid), gets: s.gets.map(g => g.n) })),
    };
  }).filter(Boolean).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function tradeNews(ctx, content = {}) {
  const trades = ctx?.data?.trades || [];
  const cov = coverage(content);
  const out = [];
  for (const tr of trades) {
    const sides = usableSides(ctx, tr);
    const names = playerKeys(sides);
    if (sides.length < 2 || !names.length) continue;
    if (coveringStory(cov, names)) continue;

    const st = STATUS[tr.status] || STATUS.pending;
    const total = names.length;
    const tag = tr.status !== 'vetoed' && total >= 4 ? 'BLOCKBUSTER TRADE 🚨' : st.tag;
    const lead = [...sides].sort((a, b) => b.gets.length - a.gets.length)[0];
    const other = sides.find(s => s !== lead);
    const headline = lead.gets.length
      ? `${tag} ${list(lead.gets.map(g => g.n))} ${tr.status === 'vetoed' ? 'stays put' : `${lead.gets.length > 1 ? 'are' : 'is'} headed to ${ctx.name(lead.rid)}`}`
      : `${tag} ${ctx.name(lead.rid)} and ${ctx.name(other.rid)} make a deal`;

    const gets = sides.map(s => `${ctx.name(s.rid)} gets: ${s.gets.length ? list(s.gets.map(playerLabel)) : 'nothing on the ESPN roster (picks or future considerations?) 🤔'}`);
    const rec = s => { const o = ctx.byRid[s.rid]?.official; return o ? `${o.w}-${o.l}${o.t ? `-${o.t}` : ''}` : ''; };
    const records = sides.map(s => rec(s) && `${ctx.name(s.rid)} (${rec(s)})`).filter(Boolean);
    out.push({
      id: `t-${tr.id}`,
      headline,
      story: [
        `THE PHONE LINES ARE OPEN AND THE FRONT OFFICES ARE BUSY ☎️🚬`,
        ...gets,
        records.length === sides.length ? `${list(records)} just shook hands on it 🤝` : null,
        st.line,
      ].filter(Boolean).join('\n\n'),
      byline: 'The Trade Desk',
      date: tr.date,
      auto: true,
    });
  }
  return out;
}

// League news with the automatic trade stories folded in, newest first.
export function withTradeNews(ctx, content = {}) {
  const news = [...(content.news || []), ...tradeNews(ctx, content)]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return { ...content, news };
}
