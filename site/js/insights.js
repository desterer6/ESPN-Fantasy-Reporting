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

// ---- Power rankings (Option B, record-first, 100 points) ---------------------------------------
// Same model as the commissioner's weekly report (docs/report-style/power-rankings.md):
//   Record 40 (win% x 40), Season PF 25, Recent form 15 (last-3-week average), Roster strength 10
//   (ESPN projection for next week's starting lineup), Points against 5, Lineup decisions 5 (neutral 2.5
//   until bench data exists). PF, recent, roster and PA are min-max scaled within the league.
export const POWER_CATEGORIES = [
  { key: 'record', label: 'Record', weight: 40, how: 'Win percentage × 40 (ties count half).' },
  { key: 'pf', label: 'Season points', weight: 25, how: 'Total points for. Best in the league gets 25, worst gets 0, everyone else in between.' },
  { key: 'recent', label: 'Recent form', weight: 15, how: 'Average score over the last 3 weeks, scaled the same way.' },
  { key: 'roster', label: 'Roster strength', weight: 10, how: 'ESPN’s projected points for next week’s starting lineup, scaled the same way.' },
  { key: 'pa', label: 'Points against', weight: 5, how: 'Total points scored against you. The toughest schedule gets 5.' },
  { key: 'lineup', label: 'Lineup decisions', weight: 5, how: 'Not measured yet (needs bench data), so every team gets a neutral 2.5.' },
];
export const POWER_WEIGHTS = Object.fromEntries(POWER_CATEGORIES.map(c => [c.key, c.weight]));

// (x - min) / (max - min); 0.5 for everyone when all values are equal; 0 when a value is missing.
function minmax(rows, key) {
  const vals = rows.map(r => r[key]).filter(v => v != null);
  if (!vals.length) return () => 0;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return r => (r[key] == null ? 0 : hi === lo ? 0.5 : (r[key] - lo) / (hi - lo));
}

export function powerRankings(ctx, week = ctx.completed[ctx.completed.length - 1], { tiers = 5 } = {}) {
  const weeks = ctx.completed.filter(w => w <= week);
  if (!weeks.length) return { week, rows: [], projAvailable: false };
  const next = ctx.data.weeks.find(w => w.week === week + 1);
  const projOf = rid => next?.matchups.flatMap(m => m.teams).find(t => t.rid === rid)?.proj ?? null;

  const rows = ctx.rids.map(rid => {
    const r = { rid, w: 0, l: 0, t: 0, pf: 0, pa: 0, scores: [] };
    for (const w of weeks) {
      const o = ctx.opp[w]?.[rid];
      if (o == null) continue;
      const mine = ctx.score[w][rid], theirs = ctx.score[w][o];
      r.pf += mine; r.pa += theirs; r.scores.push(mine);
      if (mine > theirs) r.w++; else if (mine < theirs) r.l++; else r.t++;
    }
    const last3 = r.scores.slice(-3);
    r.games = r.w + r.l + r.t;
    r.recentAvg = last3.length ? last3.reduce((a, b) => a + b, 0) / last3.length : 0;
    r.proj = projOf(rid);
    return r;
  });
  const projAvailable = rows.some(r => r.proj != null);
  const nPF = minmax(rows, 'pf'), nRecent = minmax(rows, 'recentAvg'), nPA = minmax(rows, 'pa'), nProj = minmax(rows, 'proj');
  for (const r of rows) {
    r.c = {
      record: r.games ? POWER_WEIGHTS.record * (r.w + 0.5 * r.t) / r.games : 0,
      pf: POWER_WEIGHTS.pf * nPF(r),
      recent: POWER_WEIGHTS.recent * nRecent(r),
      roster: projAvailable ? POWER_WEIGHTS.roster * nProj(r) : 0,
      pa: POWER_WEIGHTS.pa * nPA(r),
      lineup: POWER_WEIGHTS.lineup * 0.5,
    };
    r.score = Object.values(r.c).reduce((a, b) => a + b, 0);
  }
  rows.sort((a, b) => b.score - a.score || b.w - a.w || b.pf - a.pf);
  rows.forEach((r, i) => { r.rank = i + 1; });
  // Tiers: split at the (tiers - 1) biggest score gaps, so a tier is a cluster of teams the math says are close.
  const gaps = rows.slice(1).map((r, i) => ({ g: rows[i].score - r.score, i }));
  const breaks = new Set(gaps.sort((a, b) => b.g - a.g).slice(0, Math.max(0, tiers - 1)).map(x => x.i));
  let tier = 1;
  rows.forEach((r, i) => { if (i > 0 && breaks.has(i - 1)) tier++; r.tier = tier; });
  return { week, rows, projAvailable };
}

// Current rankings with movement since the previous week.
export function powerIndex(ctx) {
  const last = ctx.completed[ctx.completed.length - 1];
  const now = powerRankings(ctx, last);
  const prevWeek = ctx.completed[ctx.completed.length - 2];
  const before = prevWeek != null ? Object.fromEntries(powerRankings(ctx, prevWeek).rows.map(r => [r.rid, r.rank])) : {};
  return now.rows.map(r => ({ ...r, rec: { w: r.w, l: r.l, t: r.t }, move: before[r.rid] ? before[r.rid] - r.rank : 0 }));
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
