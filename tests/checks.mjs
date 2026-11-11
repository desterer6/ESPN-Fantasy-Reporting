// Consistency checks shared by tests/verify.mjs (real data) and tests/transform.test.mjs (fixture).
import * as A from '../site/js/analytics.js';

export function consistencyChecks(data, ok) {
  const ctx = A.prepare(data);
  const N = ctx.rids.length;
  ok(N >= 2, `expected at least 2 teams, got ${N}`);
  ok(data.weeks.every(w => w.matchups.every(m => m.teams.every(t => ctx.byRid[t.rid]))), 'every matchup team exists in teams');

  // The pivot diagonal (each team against its own schedule) must equal ESPN's declared results.
  const piv = A.pivot(ctx);
  for (const t of ctx.teams) {
    const d = piv[t.rosterId][t.rosterId];
    ok(d.w === t.official.w && d.l === t.official.l && d.t === t.official.t,
      `${t.name}: pivot diagonal ${A.fmtRec(d)} != ESPN ${A.fmtRec(t.official)}`);
  }
  const wva = A.weeklyVsAll(ctx);
  for (const t of ctx.teams) for (const w of ctx.completed) {
    const r = wva[t.rosterId].weeks[w];
    ok(r.w + r.l + r.t === N - 1, `${t.name} week ${w}: weekly record does not cover ${N - 1} opponents`);
  }
  for (const w of ctx.completed) {
    const wins = ctx.rids.reduce((a, r) => a + wva[r].weeks[w].w, 0);
    const losses = ctx.rids.reduce((a, r) => a + wva[r].weeks[w].l, 0);
    ok(wins === losses, `week ${w}: league wins (${wins}) != losses (${losses})`);
  }
  // Starters' points should add up to the team score (allowing for ESPN rounding).
  for (const wk of data.weeks.filter(w => w.complete)) for (const m of wk.matchups) for (const t of m.teams) {
    if (!t.starters.length) continue;
    const sum = t.starters.reduce((a, s) => a + s.pts, 0);
    ok(Math.abs(sum - t.pts) < 0.5, `week ${wk.week} ${ctx.name(t.rid)}: starters ${sum.toFixed(2)} != score ${t.pts}`);
  }
  return ctx;
}

// Nothing personal about league members may be published.
export function privacyChecks(data, ok) {
  const text = JSON.stringify(data);
  for (const k of ['"members"', '"owners"', '"firstName"', '"lastName"', '"displayName"', '"email"', 'SWID', 'espn_s2']) {
    ok(!text.includes(k), `site data must not contain ${k}`);
  }
  ok(!/\{[0-9A-F]{8}-[0-9A-F]{4}-/i.test(text), 'site data must not contain ESPN member IDs ({GUID})');
}
