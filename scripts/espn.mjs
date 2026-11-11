// ESPN Fantasy Football -> site data. Pure functions only (no network, no file system), so the
// whole transform is covered by tests/transform.test.mjs against a fixture.
//
// Privacy rule: only team names, scores and NFL player names leave this module. ESPN member
// records (names, emails, SWIDs, member IDs) are never read into the output.

export const POSITION = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DEF' };
const NON_STARTER_SLOTS = new Set([20, 21]); // 20 = bench, 21 = IR

export const PRO_TEAM = {
  0: null, 1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GB',
  10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO',
  19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB',
  28: 'WSH', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU',
};

// The NFL season runs Sep-Feb, so January-July still belong to the previous season.
export function defaultSeason(now = new Date()) {
  return now.getUTCMonth() < 7 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

export function teamName(t) {
  const n = (t.name || [t.location, t.nickname].filter(Boolean).join(' ') || t.abbrev || '').trim();
  return n || `Team ${t.id}`;
}

// Regular-season matchup periods and the scoring periods (NFL weeks) each one covers.
export function regularPeriods(league) {
  const ss = league.settings?.scheduleSettings || {};
  const count = ss.matchupPeriodCount || 0;
  const map = ss.matchupPeriods || {};
  const out = [];
  for (let mp = 1; mp <= count; mp++) out.push({ mp, scoringPeriods: (map[mp] || [mp]).map(Number) });
  return out;
}

function playerPoints(entry, sp) {
  const ppe = entry.playerPoolEntry || {};
  const stat = (ppe.player?.stats || []).find(s => s.scoringPeriodId === sp && s.statSourceId === 0 && s.statSplitTypeId === 1);
  return round2(stat ? stat.appliedTotal : ppe.appliedStatTotal ?? 0);
}

const round2 = x => Math.round((Number(x) || 0) * 100) / 100;

// Starters (not bench/IR) for one side of one matchup in one scoring period.
export function startersOf(side, sp, players) {
  const entries = side?.rosterForCurrentScoringPeriod?.entries || [];
  const out = [];
  for (const e of entries) {
    if (NON_STARTER_SLOTS.has(e.lineupSlotId)) continue;
    const p = e.playerPoolEntry?.player;
    const id = String(p?.id ?? e.playerId);
    if (!id || id === 'undefined') continue;
    if (p && !players[id]) {
      players[id] = { n: p.fullName || id, p: POSITION[p.defaultPositionId] || '?', t: PRO_TEAM[p.proTeamId] ?? null };
    }
    out.push({ id, pts: playerPoints(e, sp) });
  }
  return out;
}

const sidePoints = (side, decided) => round2(decided ? side.totalPoints : side.totalPointsLive ?? side.totalPoints);

/**
 * @param league   response of the league endpoint with views mTeam, mSettings, mStatus, mMatchupScore
 * @param boxByPeriod  { [scoringPeriodId]: schedule[] } from the mBoxscore view for each scoring period fetched
 * @param leagueId  the configured league ID (string)
 */
export function buildLeagueData({ league, boxByPeriod = {}, leagueId, now = new Date() }) {
  const periods = regularPeriods(league);
  const lastRegular = periods.length;
  const current = league.status?.currentMatchupPeriod ?? 0;
  const active = league.status?.isActive !== false;
  const schedule = (league.schedule || []).filter(m => (m.playoffTierType || 'NONE') === 'NONE' && m.matchupPeriodId <= lastRegular);

  const teamIds = (league.teams || []).map(t => t.id).sort((a, b) => a - b);
  const official = Object.fromEntries(teamIds.map(id => [id, { w: 0, l: 0, t: 0 }]));
  const players = {};
  const weeks = [];

  for (const { mp, scoringPeriods } of periods) {
    if (mp > Math.max(current, active ? 0 : lastRegular)) break;
    const games = schedule.filter(m => m.matchupPeriodId === mp);
    if (!games.length) continue;
    const complete = games.every(m => m.winner && m.winner !== 'UNDECIDED');

    const matchups = games.map(m => {
      const sides = [m.home, m.away].filter(Boolean);
      const teams = sides.map(s => {
        const totals = new Map();
        for (const sp of scoringPeriods) {
          const box = (boxByPeriod[sp] || []).find(b => b.id === m.id);
          const boxSide = box && [box.home, box.away].find(x => x?.teamId === s.teamId);
          for (const st of startersOf(boxSide, sp, players)) totals.set(st.id, round2((totals.get(st.id) || 0) + st.pts));
        }
        return { rid: s.teamId, pts: sidePoints(s, complete), starters: [...totals].map(([id, pts]) => ({ id, pts })) };
      });
      if (complete && teams.length === 2) {
        const [h, a] = [official[m.home.teamId], official[m.away.teamId]];
        if (m.winner === 'HOME') { h.w++; a.l++; } else if (m.winner === 'AWAY') { a.w++; h.l++; } else { h.t++; a.t++; }
      }
      return { id: m.id, teams };
    });
    weeks.push({ week: mp, complete, matchups });
  }

  const teams = (league.teams || []).map(t => ({
    rosterId: t.id,
    teamKey: `t${t.id}`,
    name: teamName(t),
    teamName: null,
    official: official[t.id],
  })).sort((a, b) => a.rosterId - b.rosterId);

  return {
    generatedAt: now.toISOString(),
    league: {
      id: String(leagueId),
      name: league.settings?.name || 'ESPN League',
      season: String(league.seasonId),
      status: active ? 'in_season' : 'complete',
      rosters: teams.length,
      regularSeasonEnd: lastRegular,
      currentWeek: current,
      seasonType: current > lastRegular ? 'post' : 'regular',
    },
    teams,
    weeks,
    players,
  };
}
