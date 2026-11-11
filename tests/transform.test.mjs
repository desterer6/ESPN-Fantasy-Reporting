// Tests the ESPN -> site transform against a fictional fixture. Needs no network: node tests/transform.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLeagueData, cleanCookie, cookieDiagnostics, defaultSeason, normalizeSwid, teamName } from '../scripts/espn.mjs';
import { consistencyChecks, privacyChecks } from './checks.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const league = JSON.parse(fs.readFileSync(path.join(dir, 'espn-league.json'), 'utf8'));
const boxByPeriod = JSON.parse(fs.readFileSync(path.join(dir, 'espn-box.json'), 'utf8'));
let failed = 0, passed = 0;
const ok = (cond, msg) => { cond ? passed++ : (failed++, console.error('FAIL:', msg)); };

const data = buildLeagueData({ league, boxByPeriod, leagueId: '123456', now: new Date('2026-10-01T00:00:00Z') });

ok(data.league.name === 'Fixture League' && data.league.season === '2026', 'league meta');
ok(data.teams.length === 8, 'eight teams');
ok(data.teams[0].name === 'Fixture Team 1', 'team name from location + nickname');
ok(teamName({ id: 3, name: ' Gridiron Gang ' }) === 'Gridiron Gang', 'team name prefers "name"');
ok(teamName({ id: 9 }) === 'Team 9', 'team name fallback');
ok(JSON.stringify(data.weeks.map(w => [w.week, w.complete])) === '[[1,true],[2,true],[3,true],[4,false]]', 'weeks 1-3 final, 4 live, future weeks omitted');
ok(data.weeks.every(w => w.matchups.length === 4), 'four matchups a week, playoffs excluded');
ok(data.weeks[3].matchups.every(m => m.teams.every(t => t.pts > 0)), 'live week uses live points');

const starters = data.weeks[0].matchups[0].teams[0].starters;
ok(starters.length === 9, `nine starters (bench excluded), got ${starters.length}`);
ok(starters.every(s => s.pts !== 99), 'uses actual (statSourceId 0) points, not projections');
const pl = data.players[starters[0].id];
ok(pl && pl.p === 'QB' && pl.t, 'player lookup has position and NFL team');
ok(Object.values(data.players).some(p => p.p === 'DEF'), 'D/ST mapped to DEF');

for (const t of data.teams) {
  const r = league.teams.find(x => x.id === t.rosterId).record.overall;
  ok(t.official.w === r.wins && t.official.l === r.losses && t.official.t === r.ties, `${t.name}: record matches ESPN`);
}
consistencyChecks(data, ok);
privacyChecks(data, ok);

ok(defaultSeason(new Date('2027-01-15T00:00:00Z')) === 2026, 'January belongs to the previous season');
ok(defaultSeason(new Date('2026-09-10T00:00:00Z')) === 2026, 'September is the current season');

// Cookie clean-up (fake values)
const guid = 'ABCDEF12-3456-7890-ABCD-EF1234567890';
ok(normalizeSwid(cleanCookie(` SWID="{${guid.toLowerCase()}}"; `, 'SWID')) === `{${guid}}`, 'SWID: prefix, quotes, case, semicolon');
ok(normalizeSwid(cleanCookie(guid, 'SWID')) === `{${guid}}`, 'SWID: braces added');
ok(cleanCookie('espn_s2=AEB%2Bx%2Fy', 'espn_s2') === 'AEB%2Bx%2Fy', 'espn_s2: prefix stripped, encoded kept');
ok(cleanCookie('AEB+x/y=', 'espn_s2') === 'AEB%2Bx%2Fy%3D', 'espn_s2: decoded value re-encoded');
ok(!cookieDiagnostics('AEBsecret%2B', `{${guid}}`).includes('secret') && cookieDiagnostics('', '').includes('missing'), 'diagnostics never print values');

console.log(`${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
