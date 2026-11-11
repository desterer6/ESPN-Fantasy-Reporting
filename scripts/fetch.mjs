// Pulls league data from ESPN Fantasy and writes site/data/league.json.
// Run with: node scripts/fetch.mjs
//
// Settings (environment variables win over config.json):
//   ESPN_LEAGUE_ID   league ID (or "leagueId" in config.json)
//   ESPN_SEASON      season year (or "season" in config.json; default: the current NFL season)
//   ESPN_S2, SWID    cookies for a private league. Secrets: never put them in config.json or commit them.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLeagueData, cleanCookie, normalizeSwid, cookieDiagnostics, defaultSeason, regularPeriods } from './espn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(await fs.readFile(path.join(root, 'config.json'), 'utf8'));
const leagueId = String(process.env.ESPN_LEAGUE_ID || cfg.leagueId || '').trim();
const season = Number(process.env.ESPN_SEASON || cfg.season || defaultSeason());
const s2 = cleanCookie(process.env.ESPN_S2, 'espn_s2');
const swid = normalizeSwid(cleanCookie(process.env.SWID, 'SWID'));

if (!/^\d+$/.test(leagueId)) {
  console.error('Set a numeric ESPN league ID in config.json ("leagueId") or the ESPN_LEAGUE_ID variable.');
  process.exit(1);
}

const BASE = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}`;
const headers = { accept: 'application/json', 'user-agent': 'league-report-site' };
if (s2 && swid) headers.cookie = `espn_s2=${s2}; SWID=${swid}`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(query, extraHeaders = {}, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(BASE + query, { headers: { ...headers, ...extraHeaders } });
      if (res.status === 401 || res.status === 403) {
        // Not retryable. Never echo the cookie values.
        throw Object.assign(new Error(
          `ESPN refused access (${res.status}). The league is private or the cookies expired: ` +
          'set/refresh the ESPN_S2 and SWID repository secrets. ' + cookieDiagnostics(s2, swid)), { fatal: true });
      }
      if (!res.ok) throw new Error(`ESPN ${res.status} ${res.statusText} for ${query.split('&')[0]}`);
      const type = res.headers.get('content-type') || '';
      if (!type.includes('json')) throw new Error('ESPN returned a non-JSON page (often a sign-in redirect: check the cookies).');
      return await res.json();
    } catch (e) {
      err = e;
      if (e.fatal) break;
      await sleep(1500 * (i + 1));
    }
  }
  throw err;
}

try {
  const league = await get('?view=mTeam&view=mSettings&view=mStatus&view=mMatchupScore');
  const current = league.status?.currentMatchupPeriod ?? 0;
  const active = league.status?.isActive !== false;
  const lastMp = active ? current : regularPeriods(league).length;

  // Lineups and player points come from the box score view, one scoring period at a time.
  const boxByPeriod = {};
  for (const { mp, scoringPeriods } of regularPeriods(league)) {
    if (mp > lastMp) break;
    for (const sp of scoringPeriods) {
      const filter = JSON.stringify({ schedule: { filterMatchupPeriodIds: { value: [mp] } } });
      const box = await get(`?view=mMatchupScore&view=mBoxscore&scoringPeriodId=${sp}`, { 'x-fantasy-filter': filter });
      boxByPeriod[sp] = box.schedule || [];
      await sleep(300); // be gentle with ESPN
    }
  }

  const out = buildLeagueData({ league, boxByPeriod, leagueId });
  const dest = path.join(root, 'site', 'data', 'league.json');
  await fs.mkdir(path.dirname(dest), { recursive: true });

  // Keep the existing file (and its timestamp) when only the timestamp changed,
  // so scheduled runs don't create empty commits.
  let unchanged = false;
  try {
    const prev = JSON.parse(await fs.readFile(dest, 'utf8'));
    const strip = o => JSON.stringify({ ...o, generatedAt: null });
    unchanged = strip(prev) === strip(out);
  } catch { /* first run */ }

  const done = out.weeks.filter(w => w.complete).map(w => w.week);
  if (unchanged) {
    console.log('No changes in league data; leaving site/data/league.json as is.');
  } else {
    await fs.writeFile(dest, JSON.stringify(out));
    console.log(`Wrote site/data/league.json: ${out.teams.length} teams, season ${out.league.season}, completed weeks [${done.join(', ')}], ${Object.keys(out.players).length} players`);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
