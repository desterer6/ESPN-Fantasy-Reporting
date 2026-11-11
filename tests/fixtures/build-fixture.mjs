// Builds a small, fictional ESPN-shaped fixture (8 teams, weeks 1-3 final, week 4 live).
// Run with: node tests/fixtures/build-fixture.mjs   (output is committed; re-run only to change it)
// Members carry fake personal data on purpose: the tests check that none of it reaches the site data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const N = 8, WEEKS = 4, CURRENT = 4;
const POS = [1, 2, 2, 3, 3, 4, 2, 5, 16]; // QB RB RB WR WR TE FLEX(RB) K D/ST
const SLOT = [0, 2, 2, 4, 4, 6, 23, 17, 16];

const teams = Array.from({ length: N }, (_, i) => ({
  id: i + 1, abbrev: `T${i + 1}`, location: 'Fixture', nickname: `Team ${i + 1}`,
  owners: [`{SECRET-MEMBER-${i + 1}}`], record: { overall: { wins: 0, losses: 0, ties: 0 } },
}));
const members = teams.map(t => ({ id: t.owners[0], displayName: `privateuser${t.id}`, firstName: 'Secret', lastName: `Person${t.id}` }));
const roster = tid => [...POS, 2, 3].map((pos, k) => ({ id: tid * 100 + k, pos, slot: k < POS.length ? SLOT[k] : 20 }));

const pairs = w => { const ids = teams.map(t => t.id); const rot = [ids[0], ...ids.slice(1).map((_, k, a) => a[(k + w) % a.length])]; return Array.from({ length: N / 2 }, (_, k) => [rot[k], rot[N - 1 - k]]); };
const schedule = [], box = {};
let mid = 1;
for (let w = 1; w <= 12; w++) for (const [h, a] of pairs(w)) schedule.push({ id: mid++, matchupPeriodId: w, playoffTierType: 'NONE', home: { teamId: h, totalPoints: 0 }, away: { teamId: a, totalPoints: 0 }, winner: 'UNDECIDED' });

for (let w = 1; w <= WEEKS; w++) {
  box[w] = [];
  for (const m of schedule.filter(x => x.matchupPeriodId === w)) {
    const bm = { id: m.id, matchupPeriodId: w, home: { teamId: m.home.teamId }, away: { teamId: m.away.teamId } };
    for (const side of ['home', 'away']) {
      let total = 0;
      const entries = roster(m[side].teamId).map(p => {
        const pts = Math.round(rnd() * 2500) / 100 * (w === CURRENT ? 0.4 : 1);
        if (p.slot !== 20) total += pts;
        return { lineupSlotId: p.slot, playerId: p.id, playerPoolEntry: { player: { id: p.id, fullName: `Player ${p.id}`, defaultPositionId: p.pos, proTeamId: (p.id % 32) + 1,
          stats: [{ scoringPeriodId: w, statSourceId: 0, statSplitTypeId: 1, appliedTotal: pts }, { scoringPeriodId: w, statSourceId: 1, statSplitTypeId: 1, appliedTotal: 99 }] } } };
      });
      bm[side].rosterForCurrentScoringPeriod = { entries };
      total = Math.round(total * 100) / 100;
      if (w === CURRENT) m[side].totalPointsLive = total; else m[side].totalPoints = total;
    }
    if (w < CURRENT) {
      m.winner = m.home.totalPoints > m.away.totalPoints ? 'HOME' : m.home.totalPoints < m.away.totalPoints ? 'AWAY' : 'TIE';
      const H = teams[m.home.teamId - 1].record.overall, A = teams[m.away.teamId - 1].record.overall;
      if (m.winner === 'HOME') { H.wins++; A.losses++; } else if (m.winner === 'AWAY') { A.wins++; H.losses++; } else { H.ties++; A.ties++; }
    }
    box[w].push(bm);
  }
}
schedule.push({ id: mid++, matchupPeriodId: 13, playoffTierType: 'WINNERS_BRACKET', home: { teamId: 1, totalPoints: 0 }, away: { teamId: 2, totalPoints: 0 }, winner: 'UNDECIDED' });

const league = {
  id: 123456, seasonId: 2026, scoringPeriodId: CURRENT,
  status: { currentMatchupPeriod: CURRENT, isActive: true, latestScoringPeriod: CURRENT },
  settings: { name: 'Fixture League', scheduleSettings: { matchupPeriodCount: 12, matchupPeriods: Object.fromEntries(Array.from({ length: 14 }, (_, i) => [i + 1, [i + 1]])) } },
  members, teams, schedule,
};
fs.writeFileSync(path.join(dir, 'espn-league.json'), JSON.stringify(league));
fs.writeFileSync(path.join(dir, 'espn-box.json'), JSON.stringify(box));
console.log('fixture written');
