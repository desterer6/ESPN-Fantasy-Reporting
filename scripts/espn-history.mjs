// League history from ESPN: one compact record per past season. Pure functions only (no I/O);
// scripts/fetch-history.mjs does the fetching and tests/history.test.mjs covers this file.
// Only team names, scores and results are kept: no owners, members or other personal data.
import { teamName } from './espn.mjs';

const round2 = x => Math.round((Number(x) || 0) * 100) / 100;

// ESPN tiers: NONE = regular season, WINNERS_BRACKET = the title bracket, anything else = consolation games.
const tierCode = t => (!t || t === 'NONE' ? 0 : t === 'WINNERS_BRACKET' ? 1 : 2);

/**
 * @param league  ESPN league response for one season (views mTeam, mSettings, mMatchupScore), or the
 *                one-element array the leagueHistory endpoint returns for seasons before 2018.
 */
export function buildSeason(league) {
  const L = Array.isArray(league) ? league[0] : league;
  if (!L || !L.seasonId) return null;
  const ss = L.settings?.scheduleSettings || {};
  const regWeeks = ss.matchupPeriodCount || 0;

  const games = (L.schedule || [])
    .filter(m => m.home && m.away && m.home.teamId != null && m.away.teamId != null)
    .map(m => {
      const win = m.winner === 'HOME' ? m.home.teamId : m.winner === 'AWAY' ? m.away.teamId : m.winner === 'TIE' ? 0 : null;
      return { w: m.matchupPeriodId, h: m.home.teamId, a: m.away.teamId, hp: round2(m.home.totalPoints), ap: round2(m.away.totalPoints), po: tierCode(m.playoffTierType), win };
    })
    .filter(g => g.win != null) // only decided games
    .sort((x, y) => x.w - y.w);

  // Regular-season totals from the games themselves (old seasons don't always carry record.overall).
  const tot = {};
  const row = id => (tot[id] ||= { w: 0, l: 0, t: 0, pf: 0, pa: 0 });
  for (const g of games.filter(x => x.po === 0)) {
    const H = row(g.h), A = row(g.a);
    H.pf += g.hp; H.pa += g.ap; A.pf += g.ap; A.pa += g.hp;
    if (g.win === g.h) { H.w++; A.l++; } else if (g.win === g.a) { A.w++; H.l++; } else { H.t++; A.t++; }
  }

  const teams = (L.teams || []).map(t => {
    const o = t.record?.overall;
    const mine = tot[t.id] || { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
    const useEspn = o && (o.wins + o.losses + o.ties) > 0;
    return {
      id: t.id,
      name: teamName(t),
      w: useEspn ? o.wins : mine.w,
      l: useEspn ? o.losses : mine.l,
      t: useEspn ? o.ties : mine.t,
      pf: round2(useEspn && o.pointsFor != null ? o.pointsFor : mine.pf),
      pa: round2(useEspn && o.pointsAgainst != null ? o.pointsAgainst : mine.pa),
      seed: Number.isInteger(t.playoffSeed) && t.playoffSeed > 0 ? t.playoffSeed : null,
      rank: Number.isInteger(t.rankCalculatedFinal) && t.rankCalculatedFinal > 0 ? t.rankCalculatedFinal : null,
    };
  }).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || (a.seed ?? 99) - (b.seed ?? 99));

  // Champion and runner-up: ESPN's final ranks, else the last title-bracket game.
  const finals = games.filter(g => g.po === 1);
  const lastFinal = finals.length ? finals.filter(g => g.w === Math.max(...finals.map(f => f.w))) : [];
  const title = lastFinal.length === 1 ? lastFinal[0] : null;
  const byRank = r => teams.find(t => t.rank === r)?.id ?? null;
  const champion = byRank(1) ?? (title && title.win ? title.win : null);
  const runnerUp = byRank(2) ?? (title && title.win ? (title.win === title.h ? title.a : title.h) : null);

  return {
    season: Number(L.seasonId),
    name: L.settings?.name || null,
    regularWeeks: regWeeks,
    playoffTeams: Number.isInteger(ss.playoffTeamCount) ? ss.playoffTeamCount : null,
    complete: champion != null,
    champion,
    runnerUp,
    teams,
    games,
  };
}

// Seasons before 2018 live on ESPN's leagueHistory endpoint; later ones on the regular one.
export const historyUrl = (leagueId, season) => (season < 2018
  ? `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${leagueId}?seasonId=${season}&view=mTeam&view=mSettings&view=mMatchupScore`
  : `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=mTeam&view=mSettings&view=mMatchupScore`);

// Which seasons still need fetching: listed by ESPN, not yet saved, or saved before they finished.
export function seasonsToFetch(previous = [], saved = []) {
  const have = new Map(saved.map(s => [s.season, s]));
  return [...new Set(previous.map(Number).filter(Number.isFinite))].sort((a, b) => a - b)
    .filter(y => !have.has(y) || !have.get(y).complete);
}
