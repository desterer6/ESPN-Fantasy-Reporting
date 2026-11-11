// Pulls every past season of the league from ESPN and saves site/data/history.json.
// Finished seasons never change, so each one is fetched once and then kept; later runs only add
// seasons that are new or were unfinished when saved. Run with: node scripts/fetch-history.mjs
// Uses the same settings and cookies as scripts/fetch.mjs (ESPN_LEAGUE_ID, ESPN_S2, SWID).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanCookie, normalizeSwid, defaultSeason } from './espn.mjs';
import { buildSeason, historyUrl, seasonsToFetch } from './espn-history.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(await fs.readFile(path.join(root, 'config.json'), 'utf8'));
const leagueId = String(process.env.ESPN_LEAGUE_ID || cfg.leagueId || '').trim();
const season = Number(process.env.ESPN_SEASON || cfg.season || defaultSeason());
const s2 = cleanCookie(process.env.ESPN_S2, 'espn_s2');
const swid = normalizeSwid(cleanCookie(process.env.SWID, 'SWID'));
const dest = path.join(root, 'site', 'data', 'history.json');

if (!/^\d+$/.test(leagueId)) { console.error('No league ID configured.'); process.exit(1); }
const headers = { accept: 'application/json', 'user-agent': 'league-report-site' };
if (s2 && swid) headers.cookie = `espn_s2=${s2}; SWID=${swid}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url) {
  let err;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 401 || res.status === 403 || res.status === 404) throw Object.assign(new Error(`ESPN ${res.status}`), { fatal: true });
      if (!res.ok) throw new Error(`ESPN ${res.status}`);
      if (!(res.headers.get('content-type') || '').includes('json')) throw new Error('ESPN returned a non-JSON page');
      return await res.json();
    } catch (e) { err = e; if (e.fatal) break; await sleep(1500 * (i + 1)); }
  }
  throw err;
}

let saved = { seasons: [] };
try { saved = JSON.parse(await fs.readFile(dest, 'utf8')); } catch { /* first run */ }

try {
  const cur = await getJson(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=mStatus&view=mSettings`);
  const previous = (cur.status?.previousSeasons || []).filter(y => y < season);
  const todo = seasonsToFetch(previous, saved.seasons);
  console.log(`ESPN lists ${previous.length} past season(s): [${previous.join(', ')}]. Fetching: [${todo.join(', ')}]`);
  const bySeason = new Map(saved.seasons.map(s => [s.season, s]));
  for (const y of todo) {
    try {
      const s = buildSeason(await getJson(historyUrl(leagueId, y)));
      if (s) { bySeason.set(y, s); console.log(`  ${y}: ${s.teams.length} teams, ${s.games.length} games, champion team ${s.champion ?? 'unknown'}`); }
    } catch (e) {
      console.log(`  ${y}: not available (${e.message})`);
    }
    await sleep(400); // be gentle with ESPN
  }
  const out = { leagueId, seasons: [...bySeason.values()].sort((a, b) => b.season - a.season) };
  const text = JSON.stringify(out);
  if (JSON.stringify({ leagueId: saved.leagueId, seasons: saved.seasons }) === text) console.log('History unchanged.');
  else { await fs.mkdir(path.dirname(dest), { recursive: true }); await fs.writeFile(dest, text); console.log(`Wrote site/data/history.json: ${out.seasons.length} season(s)`); }
} catch (e) {
  console.error(`History not refreshed: ${e.message}`);
  process.exit(1);
}
