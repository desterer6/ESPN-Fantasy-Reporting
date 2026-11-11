// Power-ranking model tests (Option B), on the fictional ESPN fixture. node tests/insights.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLeagueData } from '../scripts/espn.mjs';
import * as A from '../site/js/analytics.js';
import { playoffSize, remainingGames, currentSeeds, clinchStatus, playoffOdds, bracket, bracketOrder, regularSeasonDone } from '../site/js/playoffs.js';
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

// Playoffs: data from ESPN's schedule and settings.
ok(data.upcoming.length === 12 - 4 && data.upcoming[0].week === 5, 'rest of the regular season comes from ESPN schedule');
ok(data.upcoming.every(u => u.games.length === 4 && u.games.every(g => g.length === 2)), 'every upcoming week has full matchups');
ok(data.playoffs.teams === 4 && data.playoffs.rounds.length === 1 && data.playoffs.rounds[0].games[0].winner === null, 'playoff settings and bracket from ESPN');
ok(playoffSize(ctx) === 4, 'playoff size from ESPN settings');
ok(remainingGames(ctx).length === 4 * (12 - 3), 'remaining games: live week 4 plus weeks 5-12');
ok(!regularSeasonDone(ctx), 'regular season not over');
ok(JSON.stringify(bracketOrder(8)) === '[1,8,4,5,2,7,3,6]', '8-team bracket: 1v8, 4v5, 2v7, 3v6');
ok(JSON.stringify(bracketOrder(6)) === '[1,8,4,5,2,7,3,6]' , '6-team pads to 8 (7 and 8 are byes)');
const cs = currentSeeds(ctx);
ok(cs.source === 'espn' && cs.rows.map(r => r.seed).join() === '1,2,3,4,5,6,7,8', 'uses ESPN seeds when published');
const noSeed = JSON.parse(JSON.stringify(data)); noSeed.teams.forEach(t => { t.seed = null; });
const nsCtx = A.prepare(noSeed); const cs2 = currentSeeds(nsCtx);
ok(cs2.source === 'standings' && cs2.rows.every((r, i) => r.seed === i + 1 && r.rid === A.standings(nsCtx)[i].rid), 'falls back to standings order');
const od = playoffOdds(ctx, { sims: 2000 });
const sumPct = Object.values(od.odds).reduce((a, o) => a + o.pct, 0);
close(sumPct, 4, 'playoff odds add up to the number of spots');
ok(Object.values(od.odds).every(o => o.pct >= 0 && o.pct <= 1), 'odds within 0-1');
ok(JSON.stringify(playoffOdds(ctx, { sims: 2000 })) === JSON.stringify(od), 'odds are stable between loads');
const cl = clinchStatus(ctx);
ok(Object.values(cl).every(v => v === null), 'nobody clinched or eliminated after 3 of 12 weeks');
// Late season: 1 week left, a 3-game lead clinches and a 3-game deficit eliminates.
const fake = { rids: [1, 2, 3, 4, 5, 6], data: { playoffs: { teams: 2 }, league: { regularSeasonEnd: 10 }, weeks: [], upcoming: [{ week: 10, games: [[1, 2], [3, 4], [5, 6]] }] }, completed: [] };
const rowsF = [[1, 9], [2, 7], [3, 6], [4, 6], [5, 3], [6, 2]].map(([rid, w]) => ({ rid, w, l: 9 - w, t: 0, pf: 0 }));
const clF = clinchStatus(fake, rowsF);
ok(clF[1] === 'clinched' && clF[2] === null && clF[5] === 'eliminated' && clF[6] === 'eliminated' && clF[3] === null, 'clinch/elimination math');
const br = bracket(ctx, cs.rows);
ok(br.rounds.length === 2 && br.rounds[0].games.length === 2 && br.rounds[1].games.length === 1, '4-team bracket has semis and a final');
ok(br.rounds[0].games[0].top.seed === 1 && br.rounds[0].games[0].bottom.seed === 4 && br.rounds[0].games[1].top.seed === 2, 'seeds placed 1v4, 2v3');
ok(br.rounds[0].name === 'Semifinals' && br.rounds[1].name === 'Championship', 'round names');
// ESPN results flow through the bracket.
const done = JSON.parse(JSON.stringify(data)); done.league.currentWeek = 14;
done.playoffs.rounds = [{ week: 13, nflWeeks: [13], games: [
  { teams: [{ rid: 1, pts: 120 }, { rid: 4, pts: 99 }], winner: 1 }, { teams: [{ rid: 2, pts: 90 }, { rid: 3, pts: 101 }], winner: 3 }] },
  { week: 14, nflWeeks: [14], games: [{ teams: [{ rid: 3, pts: 130 }, { rid: 1, pts: 110 }], winner: 3 }] }];
const dctx = A.prepare(done);
const br2 = bracket(dctx, currentSeeds(dctx).rows);
ok(br2.rounds[1].games[0].top.rid === 1 && br2.rounds[1].games[0].bottom.rid === 3, 'winners advance to the final in bracket order');
ok(br2.rounds[1].games[0].pts[3] === 130 && br2.champion === 3, 'champion from ESPN result');

console.log(`${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
