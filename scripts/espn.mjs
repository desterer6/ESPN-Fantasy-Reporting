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

// Cookies pasted into secrets often carry extra text: "espn_s2=" prefixes, quotes, whitespace, a trailing ";".
export function cleanCookie(value, name) {
  if (!value) return '';
  let v = String(value).trim().replace(/;+\s*$/, '');
  if (v.toLowerCase().startsWith(name.toLowerCase() + '=')) v = v.slice(name.length + 1);
  v = v.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');
  // DevTools can show espn_s2 URL-decoded; ESPN expects the encoded form.
  if (name === 'espn_s2' && !v.includes('%') && /[+/=]/.test(v)) v = encodeURIComponent(v);
  return v;
}

// SWID must be a GUID wrapped in braces.
export function normalizeSwid(v) {
  if (!v) return '';
  const g = v.replace(/^%7B/i, '{').replace(/%7D$/i, '}').replace(/^\{|\}$/g, '');
  return `{${g.toUpperCase()}}`;
}

// Safe-to-log shape of the cookies (never the values) to debug a 401.
export function cookieDiagnostics(s2, swid) {
  return `[diagnostics: espn_s2 ${s2 ? `set, ${s2.length} chars${s2.includes('%') ? ', URL-encoded' : ''}` : 'missing'}; ` +
    `SWID ${swid ? (/^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/.test(swid) ? 'set, valid GUID format' : `set, NOT a GUID (${swid.length} chars)`) : 'missing'}]`;
}

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

const statFor = (entry, sp, source) =>
  (entry.playerPoolEntry?.player?.stats || []).find(s => s.scoringPeriodId === sp && s.statSourceId === source && s.statSplitTypeId === 1);

function playerPoints(entry, sp) {
  const stat = statFor(entry, sp, 0); // statSourceId 0 = actual points
  return round2(stat ? stat.appliedTotal : entry.playerPoolEntry?.appliedStatTotal ?? 0);
}

// ESPN's projected points for the player in that scoring period (statSourceId 1), or null if absent.
function playerProjection(entry, sp) {
  const stat = statFor(entry, sp, 1);
  return stat && Number.isFinite(stat.appliedTotal) ? stat.appliedTotal : null;
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
    out.push({ id, pts: playerPoints(e, sp), proj: playerProjection(e, sp) });
  }
  return out;
}

const sidePoints = (side, decided) => round2(decided ? side.totalPoints : side.totalPointsLive ?? side.totalPoints);

/**
 * @param league   response of the league endpoint with views mTeam, mSettings, mStatus, mMatchupScore
 * @param boxByPeriod  { [scoringPeriodId]: schedule[] } from the mBoxscore view for each scoring period fetched
 * @param leagueId  the configured league ID (string)
 */
export function buildLeagueData({ league, boxByPeriod = {}, leagueId, relegation = 0, now = new Date() }) {
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
        let proj = 0, projFound = false;
        for (const sp of scoringPeriods) {
          const box = (boxByPeriod[sp] || []).find(b => b.id === m.id);
          const boxSide = box && [box.home, box.away].find(x => x?.teamId === s.teamId);
          for (const st of startersOf(boxSide, sp, players)) {
            totals.set(st.id, round2((totals.get(st.id) || 0) + st.pts));
            if (st.proj != null) { proj += st.proj; projFound = true; }
          }
        }
        const team = { rid: s.teamId, pts: sidePoints(s, complete), starters: [...totals].map(([id, pts]) => ({ id, pts })) };
        // Projected points of the starting lineup (ESPN projections): feeds the power rankings' roster strength.
        if (projFound) team.proj = round2(proj);
        return team;
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
    seed: Number.isInteger(t.playoffSeed) && t.playoffSeed > 0 ? t.playoffSeed : null, // ESPN's current playoff seed
  })).sort((a, b) => a.rosterId - b.rosterId);

  // Rest of the regular season, straight from ESPN's schedule: weeks not already in `weeks`.
  const lastListed = weeks.length ? weeks[weeks.length - 1].week : 0;
  const upcoming = [];
  for (const { mp } of periods) {
    if (mp <= lastListed) continue;
    const games = schedule.filter(m => m.matchupPeriodId === mp && m.home && m.away).map(m => [m.home.teamId, m.away.teamId]);
    if (games.length) upcoming.push({ week: mp, games });
  }

  // Playoffs: league settings plus the winners bracket as ESPN fills it in (no consolation games).
  const ss = league.settings?.scheduleSettings || {};
  const periodMap = ss.matchupPeriods || {};
  const bracket = (league.schedule || []).filter(m => m.playoffTierType === 'WINNERS_BRACKET' && m.matchupPeriodId > lastRegular);
  const rounds = [...new Set(bracket.map(m => m.matchupPeriodId))].sort((a, b) => a - b).map(mp => ({
    week: mp,
    nflWeeks: (periodMap[mp] || [mp]).map(Number),
    games: bracket.filter(m => m.matchupPeriodId === mp).map(m => {
      const decided = !!m.winner && m.winner !== 'UNDECIDED';
      const sides = [m.home, m.away].filter(x => x && x.teamId != null);
      const win = m.winner === 'HOME' ? m.home?.teamId : m.winner === 'AWAY' ? m.away?.teamId : null;
      return { teams: sides.map(x => ({ rid: x.teamId, pts: sidePoints(x, decided) })), winner: decided ? win ?? null : null };
    }),
  }));
  const playoffs = {
    relegation, // league rule from config.json: bottom N teams are relegated
    teams: Number.isInteger(ss.playoffTeamCount) ? ss.playoffTeamCount : null,
    roundLength: Number.isInteger(ss.playoffMatchupPeriodLength) ? ss.playoffMatchupPeriodLength : 1,
    seedingRule: typeof ss.playoffSeedingRule === 'string' ? ss.playoffSeedingRule : null,
    rounds,
  };

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
    upcoming,
    playoffs,
    players,
  };
}
