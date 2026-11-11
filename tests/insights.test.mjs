// Power-ranking model tests (Option B), on the fictional ESPN fixture. node tests/insights.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLeagueData } from '../scripts/espn.mjs';
import * as A from '../site/js/analytics.js';
import { powerRankings, powerIndex, POWER_CATEGORIES, POWER_WEIGHTS } from '../site/js/insights.js';

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

console.log(`${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
