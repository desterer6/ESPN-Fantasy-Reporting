// Pulls league data from ESPN Fantasy and writes site/data/league.json.
// Run with: node scripts/fetch.mjs
//
// Settings (environment variables win over config.json):
//   ESPN_LEAGUE_ID   league ID (or "leagueId" in config.json)
//   ESPN_SEASON      season year (or "season" in config.json; default: the current NFL season)
//   relegation       how many last-place teams get relegated (config.json only; 0 or missing = none)
//   ESPN_S2, SWID    cookies for a private league. Secrets: never put them in config.json or commit them.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLeagueData, cleanCookie, normalizeSwid, cookieDiagnostics, defaultSeason, regularPeriods } from './espn.mjs';
import { tradesFromTransactions, playersFromRosters, describeTransactions, TRADE_TYPES, isTradeRow } from './trades.mjs';

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

  const relegation = Number.isInteger(cfg.relegation) && cfg.relegation > 0 ? cfg.relegation : 0;
  const out = buildLeagueData({ league, boxByPeriod, leagueId, relegation });
  const dest = path.join(root, 'site', 'data', 'league.json');
  await fs.mkdir(path.dirname(dest), { recursive: true });

  let prev = null;
  try { prev = JSON.parse(await fs.readFile(dest, 'utf8')); } catch { /* first run */ }

  // Trades become automatic news stories on the site. Optional: if ESPN's transactions view
  // fails, keep the trades from the last good run and still publish the scores.
  try {
    const lastSp = Math.max(1, Number(league.scoringPeriodId) || 1);
    // ESPN only returns the transaction types named in this filter header.
    const txFilter = { 'x-fantasy-filter': JSON.stringify({ transactions: { filterType: { value: TRADE_TYPES } } }) };
    const transactions = [];
    for (let sp = 1; sp <= lastSp; sp++) {
      const r = await get(`?view=mTransactions2&scoringPeriodId=${sp}`, txFilter);
      transactions.push(...(r.transactions || []));
      await sleep(300);
    }
    // Trades still in the league's review (veto) period are listed as pending, not as transactions.
    try {
      const pending = await get('?view=mPendingTransactions');
      transactions.push(...(pending.pendingTransactions || []), ...(pending.transactions || []));
    } catch (e) {
      if (e.fatal) throw e;
      console.error(`Pending trades not read: ${e.message}`);
    }
    // Completed trades show up only as accept/uphold rows that point at the original offer, which
    // carries the players. Ask ESPN for those offers by ID (in batches) so past trades fill in too.
    const have = new Set(transactions.map(t => t.id));
    const missing = [...new Set(transactions.filter(isTradeRow).map(t => t.relatedTransactionId).filter(id => id && !have.has(id)))];
    let found = 0;
    for (let i = 0; i < missing.length; i += 25) {
      const ids = missing.slice(i, i + 25);
      const byId = { 'x-fantasy-filter': JSON.stringify({ transactions: { filterIds: { value: ids } } }) };
      for (const query of ['?view=mTransactions2', `?view=mTransactions2&scoringPeriodId=${lastSp}`]) {
        try {
          const r = await get(query, byId);
          const rows = (r.transactions || []).filter(t => !have.has(t.id));
          rows.forEach(t => have.add(t.id));
          transactions.push(...rows);
          found += rows.length;
          if (rows.length) break;
        } catch (e) {
          if (e.fatal) throw e;
          console.error(`Trade offers by ID not read: ${e.message}`);
        }
        await sleep(300);
      }
    }
    console.log(`Original trade offers: looked up ${missing.length}, found ${found}`);
    // Shape only (types and statuses), never member data, so a parsing problem can be diagnosed from the log.
    const shape = {};
    for (const t of transactions) { const k = `${t.type}/${t.status}`; shape[k] = (shape[k] || 0) + 1; }
    console.log(`Transactions seen: ${JSON.stringify(shape)}`);
    console.log(`Transaction rows (diagnostic, no member data):\n${describeTransactions(transactions).join('\n')}`);
    const rosters = await get('?view=mRoster');
    const names = playersFromRosters(rosters, { ...out.players });
    out.trades = tradesFromTransactions(transactions, names);
    console.log(`Trades: ${out.trades.length} (${out.trades.filter(t => t.status === 'pending').length} awaiting the league vote)`);
  } catch (e) {
    if (e.fatal) throw e;
    out.trades = prev?.trades || [];
    console.error(`Trades not refreshed (kept ${out.trades.length}): ${e.message}`);
  }

  // Keep the existing file (and its timestamp) when only the timestamp changed,
  // so scheduled runs don't create empty commits.
  let unchanged = false;
  try {
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
