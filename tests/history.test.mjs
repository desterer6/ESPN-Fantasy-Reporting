// Tests for league history (scripts/espn-history.mjs and the History page math). No network:
// node tests/history.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeason, historyUrl, seasonsToFetch } from '../scripts/espn-history.mjs';
import { allTime, recordBook, seasonSummary } from '../site/js/history-stats.js';
import { historyChecks } from './checks.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const ok = (cond, msg) => { cond ? passed++ : (failed++, console.error('FAIL:', msg)); };

// A small finished season: 4 teams, 2 regular weeks, a semifinal round and a final.
const g = (w, h, a, hp, ap, tier = 'NONE') => ({ matchupPeriodId: w, playoffTierType: tier,
  home: { teamId: h, totalPoints: hp }, away: { teamId: a, totalPoints: ap }, winner: hp > ap ? 'HOME' : hp < ap ? 'AWAY' : 'TIE' });
const member = { id: '{SECRET-OWNER}', displayName: 'privateuser', firstName: 'Secret', lastName: 'Person' };
const season2019 = {
  id: 1, seasonId: 2019, members: [member],
  settings: { name: 'Test League', scheduleSettings: { matchupPeriodCount: 2, playoffTeamCount: 4 } },
  teams: [1, 2, 3, 4].map(id => ({ id, location: 'Team', nickname: `${id}`, owners: ['{SECRET-OWNER}'], playoffSeed: id, rankCalculatedFinal: 0,
    record: { overall: { wins: 0, losses: 0, ties: 0 } } })),
  schedule: [
    g(1, 1, 2, 120.004, 100), g(1, 3, 4, 90, 90),
    g(2, 1, 3, 150, 80), g(2, 2, 4, 101, 99.5),
    g(3, 1, 4, 110, 105, 'WINNERS_BRACKET'), g(3, 2, 3, 95, 130, 'WINNERS_BRACKET'),
    g(4, 1, 3, 99, 140, 'WINNERS_BRACKET'), g(4, 2, 4, 80, 70, 'LOSERS_CONSOLATION_LADDER'),
    { matchupPeriodId: 5, playoffTierType: 'NONE', home: { teamId: 1 }, away: null, winner: 'UNDECIDED' }, // bye: dropped
  ],
};
const s = buildSeason(season2019);
ok(s.season === 2019 && s.name === 'Test League' && s.regularWeeks === 2 && s.playoffTeams === 4, 'season basics');
ok(s.games.length === 8, `bye and undecided games dropped (got ${s.games.length})`);
ok(s.games[0].hp === 120 && s.games.every(x => x.po === 0 || x.w > 2), 'points rounded, regular games first');
ok(s.games.find(x => x.w === 4 && x.h === 2).po === 2, 'consolation game tagged 2');
ok(s.games.find(x => x.w === 1 && x.h === 3).win === 0, 'tie recorded as 0');
const t1 = s.teams.find(t => t.id === 1), t3 = s.teams.find(t => t.id === 3);
ok(t1.w === 2 && t1.l === 0 && t1.pf === 270 && t1.pa === 180, 'record rebuilt from games when ESPN record is empty');
ok(t3.w === 0 && t3.l === 1 && t3.t === 1, 'tie counted');
ok(s.champion === 3 && s.runnerUp === 1 && s.complete, 'champion and runner-up from the final when ESPN ranks are missing');
ok(t1.name === 'Team 1' && t1.rank === null, 'team name and empty rank');

// ESPN's own final ranks win when present; pre-2018 responses come as a one-element array.
const ranked = JSON.parse(JSON.stringify(season2019));
ranked.seasonId = 2016;
ranked.teams.forEach(t => { t.rankCalculatedFinal = 5 - t.id; t.record.overall = { wins: t.id, losses: 4 - t.id, ties: 0, pointsFor: 100 * t.id, pointsAgainst: 50 }; });
const r = buildSeason([ranked]);
ok(r.season === 2016 && r.champion === 4 && r.runnerUp === 3, 'final ranks used, array response accepted');
ok(r.teams[0].id === 4 && r.teams[0].w === 4 && r.teams[0].pf === 400, 'ESPN record used when present, sorted by final rank');

// Unfinished season: no champion yet, so it is fetched again next time.
const live = JSON.parse(JSON.stringify(season2019));
live.schedule = live.schedule.filter(x => x.playoffTierType === 'NONE');
const u = buildSeason(live);
ok(u.champion === null && u.complete === false, 'no champion before the final');
ok(buildSeason(null) === null && buildSeason([]) === null && buildSeason({}) === null, 'empty responses');

// Never keep personal data.
const text = JSON.stringify([s, r]);
for (const k of ['SECRET', 'privateuser', 'Person', 'owners', 'members', 'displayName']) ok(!text.includes(k), `no ${k} in history`);
const fixture = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures/espn-league.json'), 'utf8'));
const fx = buildSeason(fixture);
ok(fx && fx.teams.length === 8 && !JSON.stringify(fx).includes('SECRET') && !JSON.stringify(fx).includes('privateuser'), 'fixture season has no personal data');

// URLs and which seasons to fetch.
ok(historyUrl('9', 2015).includes('/leagueHistory/9?seasonId=2015') && historyUrl('9', 2019).includes('/seasons/2019/segments/0/leagues/9'), 'endpoint by year');
ok(historyUrl('9', 2019).includes('view=mMatchupScore') && historyUrl('9', 2019).includes('view=mTeam'), 'views requested');
ok(JSON.stringify(seasonsToFetch([2021, 2019, 2020, 2020], [{ season: 2019, complete: true }, { season: 2020, complete: false }])) === '[2020,2021]', 'skip saved complete seasons');
ok(seasonsToFetch(undefined, undefined).length === 0, 'nothing listed');

// History page math.
const hist = { leagueId: '1', seasons: [r, s].map(x => ({ ...x })) };
const at = allTime(hist);
const a3 = at.find(x => x.id === 3);
ok(a3.seasons === 2 && a3.titles === 1 && a3.finals === 2, `team 3: titles and finals (${JSON.stringify(a3)})`);
ok(a3.name === 'Team 3', 'all-time name is the most recent one');
const a1 = at.find(x => x.id === 1);
ok(a1.w === 1 + 2 && a1.l === 3 + 0, 'all-time wins add up across seasons');
ok(a1.playoffs === 2, 'playoff appearances counted from playoff games');
const rb = recordBook(hist);
ok(rb.high.pts === 150 && rb.high.id === 1, 'highest score');
ok(rb.low.pts === 70, 'lowest score includes playoff/consolation games');
ok(rb.blowout.margin === 70, 'biggest blowout');
ok(rb.closest.margin === 1.5, 'closest decided game (ties excluded)');
ok(rb.bestSeason.id === 4 && rb.bestSeason.season === 2016, 'best regular season: win rate, then points');
const sum = seasonSummary(s);
ok(sum.regTop.id === 1 && sum.playoffRounds.length === 2 && sum.playoffRounds[1].games.length === 1, 'season summary: top seed and title rounds');

// Shared checks for the published file.
historyChecks(hist, ok);

console.log(`${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
