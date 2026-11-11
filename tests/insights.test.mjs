// Power-ranking model tests (Option B), on the fictional ESPN fixture. node tests/insights.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLeagueData } from '../scripts/espn.mjs';
import * as A from '../site/js/analytics.js';
import { powerRankings, powerIndex, matchupToWatch, tickerItems, POWER_CATEGORIES, POWER_WEIGHTS } from '../site/js/insights.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const data = buildLeagueData({ league: read('espn-league.json'), boxByPeriod: read('espn-box.json'), leagueId: '1' });
const ctx = A.prepare(data);
let failed = 0, passed = 0;
const ok = (c, m) => { c ? passed++ : (failed++, console.error('FAIL:', m)); };
const close = (a, b, m) => ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);

ok(POWER_CATEGORIES.reduce((a, c) => a + c.weight, 0) === 100, 'weights add to 100');
const pr = powerRankings(ctx);
ok(pr.week === 3 && pr.rows.length === 8, 'ranks every team through the last completed week');
ok(pr.projAvailable, 'roster strength uses next week\'s ESPN projections');

const st = Object.fromEntries(A.standings(ctx).map(r => [r.rid, r]));
for (const r of pr.rows) {
  ok(r.w === st[r.rid].w && r.l === st[r.rid].l, `${r.rid}: record matches standings`);
  close(r.c.record, 40 * (r.w + 0.5 * r.t) / r.games, `${r.rid}: record points`);
  close(r.score, Object.values(r.c).reduce((a, b) => a + b, 0), `${r.rid}: score is the sum of categories`);
  ok(r.score >= 0 && r.score <= 100, `${r.rid}: score within 0-100`);
  for (const k of Object.keys(POWER_WEIGHTS)) ok(r.c[k] >= -1e-9 && r.c[k] <= POWER_WEIGHTS[k] + 1e-9, `${r.rid}: ${k} within its weight`);
  close(r.c.lineup, 2.5, 'lineup is neutral');
}
const max = k => Math.max(...pr.rows.map(r => r.c[k])), min = k => Math.min(...pr.rows.map(r => r.c[k]));
for (const k of ['pf', 'recent', 'pa']) { close(max(k), POWER_WEIGHTS[k], `${k}: best team gets full weight`); close(min(k), 0, `${k}: worst team gets 0`); }
// The fixture projects every lineup the same, so roster is a neutral 5 for all (equal values -> 0.5).
ok(pr.rows.every(r => Math.abs(r.c.roster - 5) < 1e-9), 'equal projections give everyone half the roster weight');
const bestPf = pr.rows.slice().sort((a, b) => b.pf - a.pf)[0];
close(bestPf.c.pf, 25, 'most PF gets 25');
ok(pr.rows.every((r, i) => i === 0 || pr.rows[i - 1].score >= r.score), 'sorted by score');
ok(pr.rows[0].tier === 1 && pr.rows.at(-1).tier <= 5, 'tiers start at 1, at most 5');

// No projections at all: roster is 0 for everyone (not a fake neutral value).
const noProj = JSON.parse(JSON.stringify(data)); noProj.weeks.forEach(w => w.matchups.forEach(m => m.teams.forEach(t => delete t.proj)));
const pr2 = powerRankings(A.prepare(noProj));
ok(!pr2.projAvailable && pr2.rows.every(r => r.c.roster === 0), 'missing projections give 0 roster points');

const pi = powerIndex(ctx);
ok(pi.length === 8 && pi.every(r => Number.isInteger(r.move)), 'movement computed vs previous week');
ok(pi.reduce((a, r) => a + r.move, 0) === 0, 'moves balance out');

// Matchup to watch: a real game from the week after the last final one, chosen by the stated formula.
const mw = matchupToWatch(ctx);
ok(mw && mw.week === pr.week + 1, 'matchup to watch is for the next week');
const nextGames = data.weeks.find(w => w.week === mw.week).matchups.filter(m => m.teams.length === 2);
ok(nextGames.some(m => m.teams.map(t => t.rid).sort().join() === [mw.a.rid, mw.b.rid].sort().join()), 'picked pair actually plays that week');
const rowOf = Object.fromEntries(pr.rows.map(r => [r.rid, r]));
const watchOf = m => { const [a, b] = m.teams; const gap = Math.abs(a.proj - b.proj); return 0.6 * (rowOf[a.rid].score + rowOf[b.rid].score) / 2 + 0.4 * 100 * Math.max(0, 1 - gap / 30); };
close(mw.watch, Math.max(...nextGames.map(watchOf)), 'picked the highest watch score');
ok(mw.why.length >= 1, 'gives reasons');
ok(tickerItems(ctx).some(i => i.tag === `WEEK ${mw.week} MATCHUP`), 'matchup appears in the ticker');
const preseason = A.prepare({ ...data, weeks: data.weeks.map(w => ({ ...w, complete: false })) });
ok(matchupToWatch(preseason) === null, 'nothing before any week is final');

console.log(`${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
