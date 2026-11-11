#!/usr/bin/env node
// Option B power-ranking scorecard for the weekly report. Works for either league, because the
// Sleeper site (Yellowstone) and this ESPN site write the same site/data/league.json shape.
//
//   node scripts/power-rankings.mjs <league.json> [week] [--proj projections.json] [--prev prev.json]
//
//   week          last completed week to rank through (default: latest completed week)
//   --proj FILE   next week's projected starting-lineup points, {"Team name": 118.4, ...},
//                 read off the Sleeper/ESPN matchup screen. Missing file = roster category left at 0
//                 for everyone and flagged in the output.
//   --prev FILE   last published ranking, {"Team name": 3, ...}, for the (+/-) movement markers.
//   --tiers N     number of tiers (default 5), split at the N-1 biggest score gaps.
//   --json        print the scorecard as JSON (save it as next week's --prev source).
//
// Weights (Option B, record-first): record 40, season PF 25, recent 15, roster 10, PA 5, lineup 5.
// Record = win% x 40. PF, recent (last-3-week average), roster and PA are min-max normalized within
// the league. Lineup decisions are not measured yet, so every team gets a neutral 2.5.
// See docs/report-style/power-rankings.md for the reasoning and the known limitations.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const asJson = args.includes('--json'); if (asJson) args.splice(args.indexOf('--json'), 1);
const projFile = flag('--proj');
const tierCount = Number(flag('--tiers') || 5);
const prevFile = flag('--prev');
const [file, weekArg] = args;
if (!file) { console.error('usage: node scripts/power-rankings.mjs <league.json> [week] [--proj f] [--prev f] [--json]'); process.exit(1); }

const data = JSON.parse(readFileSync(file, 'utf8'));
const completed = data.weeks.filter(w => w.complete).map(w => w.week);
const week = weekArg ? Number(weekArg) : Math.max(...completed);
if (!completed.includes(week)) { console.error(`Week ${week} is not complete in ${file}.`); process.exit(1); }
const proj = projFile ? JSON.parse(readFileSync(projFile, 'utf8')) : null;
const prev = prevFile ? JSON.parse(readFileSync(prevFile, 'utf8')) : null;

export const WEIGHTS = { record: 40, pf: 25, recent: 15, roster: 10, pa: 5, lineup: 5 };
// Sleeper teams without a custom name show as "Team <username>"; ESPN teams carry the name in `name`.
const label = t => (t.teamName && t.teamName.trim()) || (t.userId ? `Team ${t.name}` : t.name);

// Season ledger through `week`.
const L = Object.fromEntries(data.teams.map(t => [t.rosterId, { team: label(t), user: t.name, w: 0, l: 0, t: 0, pf: 0, pa: 0, scores: {} }]));
for (const wk of data.weeks) {
  if (!wk.complete || wk.week > week) continue;
  for (const m of wk.matchups) {
    if (m.teams.length !== 2) continue;
    const [a, b] = m.teams;
    for (const [x, y] of [[a, b], [b, a]]) {
      const r = L[x.rid];
      r.pf += x.pts; r.pa += y.pts; r.scores[wk.week] = x.pts;
      if (x.pts > y.pts) r.w++; else if (x.pts < y.pts) r.l++; else r.t++;
    }
  }
}
const rows = Object.values(L);
for (const r of rows) {
  const recentWeeks = Object.keys(r.scores).map(Number).sort((a, b) => b - a).slice(0, 3);
  r.recentAvg = recentWeeks.reduce((s, w) => s + r.scores[w], 0) / recentWeeks.length;
  r.games = r.w + r.l + r.t;
  r.proj = proj ? proj[r.team] ?? proj[r.user] ?? null : null;
}

const minmax = (key) => {
  const vals = rows.map(r => r[key]).filter(v => v != null);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return r => (r[key] == null ? 0 : hi === lo ? 0.5 : (r[key] - lo) / (hi - lo));
};
const nPF = minmax('pf'), nRecent = minmax('recentAvg'), nPA = minmax('pa'), nProj = minmax('proj');
for (const r of rows) {
  r.c = {
    record: WEIGHTS.record * (r.w + 0.5 * r.t) / r.games,
    pf: WEIGHTS.pf * nPF(r),
    recent: WEIGHTS.recent * nRecent(r),
    roster: proj ? WEIGHTS.roster * nProj(r) : 0,
    pa: WEIGHTS.pa * nPA(r),
    lineup: WEIGHTS.lineup * 0.5,
  };
  r.score = Object.values(r.c).reduce((a, b) => a + b, 0);
}
// Tie-break: higher score, then better record, then more PF.
rows.sort((a, b) => b.score - a.score || (b.w - a.w) || (b.pf - a.pf));
rows.forEach((r, i) => {
  r.rank = i + 1;
  const before = prev ? prev[r.team] ?? prev[r.user] : null;
  r.move = before == null ? null : before - r.rank;
});

// Score-based tiers: split the list at the (tiers - 1) biggest score gaps between neighbours, so a
// tier is a cluster of teams the math says are close. The funny tier labels are written by hand.
const gaps = rows.slice(1).map((r, i) => rows[i].score - r.score);
const breaks = gaps.map((g, i) => ({ g, i })).sort((a, b) => b.g - a.g).slice(0, Math.max(0, tierCount - 1)).map(x => x.i);
let tier = 1;
rows.forEach((r, i) => { if (i > 0 && breaks.includes(i - 1)) tier++; r.tier = tier; });

if (asJson) {
  console.log(JSON.stringify({ league: data.league?.name, week, rows }, null, 2));
  process.exit(0);
}

const f = n => n.toFixed(2);
const mv = m => (m == null ? 'new' : m > 0 ? `+${m}` : m < 0 ? `${m}` : '=');
console.log(`# ${data.league?.name || 'League'} power rankings after Week ${week}\n`);
console.log('| # | Move | Tier | Team | Record | Score | Rec/40 | PF/25 | Recent/15 | Roster/10 | PA/5 | Lineup/5 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.rank} | ${mv(r.move)} | ${r.tier} | ${r.team} | ${r.w}-${r.l}${r.t ? '-' + r.t : ''} | **${f(r.score)}** | ${f(r.c.record)} | ${f(r.c.pf)} | ${f(r.c.recent)} | ${f(r.c.roster)} | ${f(r.c.pa)} | ${f(r.c.lineup)} |`);
}
console.log('\nInputs: PF / PA / last-3 avg' + (proj ? ' / next-week projection' : ''));
for (const r of rows) console.log(`- ${r.team}: ${f(r.pf)} / ${f(r.pa)} / ${f(r.recentAvg)}${proj ? ` / ${r.proj ?? 'MISSING'}` : ''}`);
if (!proj) console.log('\n> Roster (10%) is 0 for everyone: pass --proj with next week\'s projected lineup scores.');
if (proj && rows.some(r => r.proj == null)) console.log('\n> Some teams have no projection and got 0 roster points. Check the names in the --proj file.');
console.log('> Lineup (5%) is a neutral 2.5 for everyone: lineup decisions are not measured yet.');
