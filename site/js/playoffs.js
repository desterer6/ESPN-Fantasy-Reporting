// Playoff picture from ESPN data (no AI): current seeds, clinch/elimination math, simulated playoff
// odds for the rest of the regular season, and the winners bracket (projected or real).
// Pure functions over the analytics context, shared by the site and tests.
import * as A from './analytics.js';

// Number of playoff teams: ESPN's league setting, capped at the league size (8 in this league).
export const playoffSize = ctx => Math.min(ctx.data.playoffs?.teams || 8, ctx.rids.length);

const regEnd = ctx => ctx.data.league.regularSeasonEnd;

// Regular-season games not final yet: the current week plus ESPN's schedule for the weeks after it.
export function remainingGames(ctx) {
  const out = [];
  for (const w of ctx.data.weeks) {
    if (w.complete || w.week > regEnd(ctx)) continue;
    for (const m of w.matchups) if (m.teams.length === 2) out.push({ week: w.week, a: m.teams[0].rid, b: m.teams[1].rid, projA: m.teams[0].proj ?? null, projB: m.teams[1].proj ?? null });
  }
  for (const u of ctx.data.upcoming || []) {
    if (u.week > regEnd(ctx)) continue;
    for (const [a, b] of u.games) out.push({ week: u.week, a, b, projA: null, projB: null });
  }
  return out;
}

export const regularSeasonDone = ctx => ctx.completed.includes(regEnd(ctx)) || ctx.data.league.currentWeek > regEnd(ctx);

// Seeding if the season ended today. ESPN's own seeds (which apply the league's tiebreakers) when it
// publishes a full set; otherwise record, then points for.
export function currentSeeds(ctx) {
  const st = A.standings(ctx);
  const seeds = ctx.teams.map(t => t.seed);
  const espn = seeds.every(s => Number.isInteger(s)) && new Set(seeds).size === seeds.length;
  const rows = st.map(r => ({ ...r, seed: espn ? ctx.byRid[r.rid].seed : r.rank }));
  rows.sort((a, b) => a.seed - b.seed);
  return { rows, source: espn ? 'espn' : 'standings' };
}

// Clinched / eliminated, counting wins only (a tie in wins counts as a threat, so this never over-claims).
export function clinchStatus(ctx, rows = A.standings(ctx), remaining = remainingGames(ctx)) {
  const K = playoffSize(ctx);
  const left = Object.fromEntries(ctx.rids.map(r => [r, 0]));
  for (const g of remaining) { left[g.a]++; left[g.b]++; }
  const cur = Object.fromEntries(rows.map(r => [r.rid, A.winsOf(r)]));
  const max = Object.fromEntries(rows.map(r => [r.rid, cur[r.rid] + left[r.rid]]));
  const out = {};
  for (const r of rows) {
    const canCatch = rows.filter(o => o.rid !== r.rid && max[o.rid] >= cur[r.rid]).length;
    const surelyAhead = rows.filter(o => o.rid !== r.rid && cur[o.rid] > max[r.rid]).length;
    out[r.rid] = canCatch < K ? 'clinched' : surelyAhead >= K ? 'eliminated' : null;
  }
  return out;
}

// Small seeded PRNG so the odds don't jump around on every page load.
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Monte Carlo over the remaining regular season. Each team scores from a normal curve built on its
// season so far (average pulled 25% toward the league average, spread at least 15 points); ESPN's
// projection is used as the average for the current week when it exists. Seeds by wins, then points.
export function playoffOdds(ctx, { sims = 5000 } = {}) {
  const K = playoffSize(ctx);
  const st = A.standings(ctx);
  const remaining = remainingGames(ctx);
  const all = ctx.completed.flatMap(w => ctx.rids.map(r => ctx.score[w][r]).filter(v => v != null));
  const lgMean = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 100;
  const model = {};
  for (const rid of ctx.rids) {
    const xs = ctx.completed.map(w => ctx.score[w][rid]).filter(v => v != null);
    const m = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : lgMean;
    const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)) : 20;
    model[rid] = { mean: 0.75 * m + 0.25 * lgMean, sd: Math.max(15, sd) };
  }
  const rand = mulberry32(1000 + ctx.completed.length);
  const gauss = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
  const base = Object.fromEntries(st.map(r => [r.rid, { w: A.winsOf(r), pf: r.pf }]));
  const made = Object.fromEntries(ctx.rids.map(r => [r, 0]));
  const seedCount = Object.fromEntries(ctx.rids.map(r => [r, Array(K + 1).fill(0)]));
  const ids = ctx.rids.slice();
  const done = remaining.length === 0;
  for (let s = 0; s < (done ? 1 : sims); s++) {
    const w = {}, pf = {};
    for (const r of ids) { w[r] = base[r].w; pf[r] = base[r].pf; }
    for (const g of remaining) {
      const pa = (g.projA ?? model[g.a].mean) + model[g.a].sd * gauss();
      const pb = (g.projB ?? model[g.b].mean) + model[g.b].sd * gauss();
      pf[g.a] += pa; pf[g.b] += pb;
      if (pa > pb) w[g.a]++; else if (pb > pa) w[g.b]++; else { w[g.a] += 0.5; w[g.b] += 0.5; }
    }
    const order = ids.slice().sort((x, y) => w[y] - w[x] || pf[y] - pf[x]);
    order.slice(0, K).forEach((r, i) => { made[r]++; seedCount[r][i + 1]++; });
  }
  const n = done ? 1 : sims;
  const out = {};
  for (const r of ids) {
    const dist = seedCount[r].map(c => c / n);
    let likely = null, best = 0;
    for (let k = 1; k <= K; k++) if (dist[k] > best) { best = dist[k]; likely = k; }
    out[r] = { pct: made[r] / n, seedDist: dist, likelySeed: likely, likelySeedPct: best, firstPct: dist[1] };
  }
  return { odds: out, sims: n, remaining: remaining.length };
}

// Standard bracket order (1 v N, 4 v 5, ...), padded to a power of two; seeds past `size` are byes.
export function bracketOrder(size) {
  let p = 1; while (p < size) p *= 2;
  let order = [1];
  while (order.length < p) { const m = order.length * 2; order = order.flatMap(s => [s, m + 1 - s]); }
  return order;
}

const ROUND_NAMES = { 1: 'Championship', 2: 'Semifinals', 3: 'Quarterfinals', 4: 'Round of 16' };

// The winners bracket: seeds placed by bracketOrder, results filled in from ESPN's playoff games.
export function bracket(ctx, seedRows) {
  const K = playoffSize(ctx);
  const bySeed = Object.fromEntries(seedRows.filter(r => r.seed <= K).map(r => [r.seed, r.rid]));
  const seedOf = Object.fromEntries(seedRows.map(r => [r.rid, r.seed]));
  const order = bracketOrder(K);
  // ESPN's bracket only counts once the regular season is over (before that it can hold placeholders).
  const espnRounds = regularSeasonDone(ctx) ? ctx.data.playoffs?.rounds || [] : [];
  const len = ctx.data.playoffs?.roundLength || 1;
  const nRounds = Math.log2(order.length);
  const rounds = [];
  // Each slot: { rid, seed } or null (unknown yet) or { bye: true }.
  let slots = order.map(s => (s <= K ? { rid: bySeed[s] ?? null, seed: s } : { bye: true }));
  for (let r = 0; r < nRounds; r++) {
    const startWeek = regEnd(ctx) + 1 + r * len;
    const espn = espnRounds[r];
    const games = [];
    const next = [];
    for (let i = 0; i < slots.length; i += 2) {
      const [x, y] = [slots[i], slots[i + 1]];
      const g = { top: x, bottom: y, winner: null, pts: {}, bye: !!(x?.bye || y?.bye) };
      if (g.bye) {
        g.winner = x?.bye ? y?.rid ?? null : x?.rid ?? null;
      } else {
        const game = espn?.games.find(eg => eg.teams.some(t => t.rid === x?.rid || t.rid === y?.rid));
        if (game) {
          // ESPN's bracket is the source of truth once it exists.
          let [ta, tb] = game.teams.map(t => t.rid);
          if ((ta != null && ta === y?.rid) || (tb != null && tb === x?.rid)) [ta, tb] = [tb, ta];
          if (ta != null) g.top = { rid: ta, seed: seedOf[ta] };
          if (tb != null) g.bottom = { rid: tb, seed: seedOf[tb] };
          for (const t of game.teams) g.pts[t.rid] = t.pts;
          g.winner = game.winner ?? null;
          g.live = !game.winner && game.teams.some(t => t.pts > 0);
        }
      }
      games.push(g);
      const w = g.winner != null ? { rid: g.winner, seed: seedOf[g.winner] } : null;
      next.push(w);
    }
    rounds.push({ name: ROUND_NAMES[nRounds - r] || `Round ${r + 1}`, week: espn?.week ?? startWeek, nflWeeks: espn?.nflWeeks ?? Array.from({ length: len }, (_, k) => startWeek + k), games });
    slots = next;
  }
  const final = rounds[rounds.length - 1]?.games[0];
  return { rounds, champion: final?.winner ?? null };
}
