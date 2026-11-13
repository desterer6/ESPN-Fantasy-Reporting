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

export function tradeNews(ctx, content = {}) {
  const trades = ctx?.data?.trades || [];
  const covered = (content.news || []).filter(n => Array.isArray(n.trade) && n.trade.length).map(n => new Set(n.trade.map(norm)));
  const out = [];
  for (const tr of trades) {
    const sides = (tr.sides || []).filter(s => ctx.byRid?.[s.rid]);
    const names = sides.flatMap(s => s.gets.map(g => norm(g.n)));
    if (sides.length < 2 || !names.length) continue;
    // Same players on both lists (a smaller earlier trade with one of those players still gets its own story).
    if (covered.some(set => set.size === new Set(names).size && names.every(n => set.has(n)))) continue;

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
