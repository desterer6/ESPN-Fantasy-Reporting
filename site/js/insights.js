// Rule-based storylines from the league data (no AI): weekly superlatives, streaks, power index and
// the ticker feed. Pure functions over the analytics context, shared by the site and tests.
import * as A from './analytics.js';

const f1 = n => n.toFixed(1);

// Superlatives for one completed week.
export function weekStory(ctx, w) {
  const entry = ctx.data.weeks.find(x => x.week === w);
  if (!entry) return null;
  const games = entry.matchups.filter(m => m.teams.length === 2).map(m => {
    const [a, b] = m.teams.slice().sort((x, y) => y.pts - x.pts);
    return { winner: a.rid, loser: b.rid, wPts: a.pts, lPts: b.pts, margin: a.pts - b.pts, tie: a.pts === b.pts };
  });
  const scores = entry.matchups.flatMap(m => m.teams.map(t => ({ rid: t.rid, pts: t.pts, starters: t.starters })));
  if (!games.length || !scores.length) return null;
  const by = (arr, f) => arr.slice().sort(f)[0];
  const top = by(scores, (a, b) => b.pts - a.pts);
  const low = by(scores, (a, b) => a.pts - b.pts);
  // Best individual starter performance of the week.
  let mvp = null;
  for (const s of scores) for (const p of s.starters || []) if (!mvp || p.pts > mvp.pts) mvp = { ...p, rid: s.rid };
  return {
    week: w, complete: entry.complete, games,
    top, low, mvp,
    blowout: by(games, (a, b) => b.margin - a.margin),
    closest: by(games, (a, b) => a.margin - b.margin),
    avg: scores.reduce((a, s) => a + s.pts, 0) / scores.length,
  };
}

// Current win/loss streak per team, over completed weeks.
export function streaks(ctx) {
  const out = {};
  for (const rid of ctx.rids) {
    let kind = null, n = 0;
    for (let i = ctx.completed.length - 1; i >= 0; i--) {
      const w = ctx.completed[i]; const o = ctx.opp[w]?.[rid];
      if (o == null) continue;
      const r = ctx.score[w][rid] > ctx.score[w][o] ? 'W' : ctx.score[w][rid] < ctx.score[w][o] ? 'L' : 'T';
      if (kind == null) { kind = r; n = 1; } else if (r === kind) n++; else break;
    }
    out[rid] = kind ? { kind, n, label: `${kind}${n}` } : { kind: null, n: 0, label: '–' };
  }
  return out;
}

// Power index: all-play win% (every team vs every team, every week). Movement compares to a week earlier.
export function powerIndex(ctx) {
  const rank = weeks => {
    if (!weeks.length) return [];
    const wva = A.weeklyVsAll(ctx, weeks);
    const pf = Object.fromEntries(ctx.rids.map(r => [r, weeks.reduce((a, w) => a + ctx.score[w][r], 0)]));
    return ctx.rids.map(rid => {
      const t = wva[rid].total; const g = t.w + t.l + t.t;
      return { rid, pct: g ? (t.w + 0.5 * t.t) / g : 0, rec: t, pf: pf[rid] };
    }).sort((a, b) => b.pct - a.pct || b.pf - a.pf).map((r, i) => ({ ...r, rank: i + 1 }));
  };
  const now = rank(ctx.completed);
  const before = Object.fromEntries(rank(ctx.completed.slice(0, -1)).map(r => [r.rid, r.rank]));
  return now.map(r => ({ ...r, move: before[r.rid] ? before[r.rid] - r.rank : 0 }));
}

// Ticker feed: approved league news first, then automatic headlines.
export function tickerItems(ctx, content = {}) {
  const items = [];
  for (const n of (content.news || []).slice(0, 6)) items.push({ tag: 'NEWS', text: n.headline, href: `#/news/${n.id}` });
  const latestReport = (content.reports || [])[0];
  if (latestReport) items.push({ tag: 'REPORT', text: latestReport.title, href: `#/reports/${latestReport.id}` });

  const last = ctx.completed[ctx.completed.length - 1];
  const live = ctx.data.weeks.find(w => !w.complete && w.matchups.some(m => m.teams.some(t => t.pts > 0)));
  if (live) {
    for (const m of live.matchups.filter(x => x.teams.length === 2)) {
      const [a, b] = m.teams;
      items.push({ tag: 'LIVE', text: `${ctx.name(a.rid)} ${f1(a.pts)} – ${f1(b.pts)} ${ctx.name(b.rid)}`, href: '#/scores' });
    }
  }
  if (last != null) {
    const s = weekStory(ctx, last);
    const st = A.standings(ctx);
    items.push({ tag: 'STANDINGS', text: `${ctx.name(st[0].rid)} leads the league at ${A.fmtRec(st[0])}`, href: '#/standings' });
    if (s) {
      items.push({ tag: `WEEK ${last}`, text: `Top score: ${ctx.name(s.top.rid)} with ${f1(s.top.pts)}`, href: '#/scores' });
      items.push({ tag: `WEEK ${last}`, text: `Blowout: ${ctx.name(s.blowout.winner)} beat ${ctx.name(s.blowout.loser)} by ${f1(s.blowout.margin)}`, href: '#/scores' });
      items.push({ tag: `WEEK ${last}`, text: `Nail-biter: ${ctx.name(s.closest.winner)} edged ${ctx.name(s.closest.loser)} by ${f1(s.closest.margin)}`, href: '#/scores' });
      if (s.mvp && ctx.players[s.mvp.id]) items.push({ tag: `WEEK ${last}`, text: `Player of the week: ${ctx.players[s.mvp.id].n} (${f1(s.mvp.pts)}) for ${ctx.name(s.mvp.rid)}`, href: '#/scores' });
    }
    const sk = streaks(ctx);
    for (const rid of ctx.rids) {
      if (sk[rid].kind === 'W' && sk[rid].n >= 3) items.push({ tag: 'STREAK', text: `${ctx.name(rid)} has won ${sk[rid].n} straight`, href: '#/standings' });
      if (sk[rid].kind === 'L' && sk[rid].n >= 3) items.push({ tag: 'SKID', text: `${ctx.name(rid)} has dropped ${sk[rid].n} in a row`, href: '#/standings' });
    }
  }
  return items;
}
