// ESPN transactions -> trades for the site. Pure functions only (no network, no file system);
// tests/trades.test.mjs covers them against a fictional fixture.
//
// ESPN's mTransactions2 view lists every move for one scoring period. A trade shows up as several
// rows that point at each other through relatedTransactionId:
//   TRADE_PROPOSAL  the offer (status EXECUTED once the trade goes through)
//   TRADE_ACCEPT    the other team said yes (status PENDING while the league can still veto)
//   TRADE_UPHOLD    the review period passed or the commissioner upheld it
//   TRADE_VETO      the league or the commissioner vetoed it
//   TRADE_DECLINE   turned down: never published
// Each row's items carry { type: 'TRADE', playerId, fromTeamId, toTeamId }.
//
// Privacy rule: only team IDs, NFL player names and dates leave this module. Member IDs on the
// rows (memberId, proposingTeam owners) are never copied.
import { POSITION, PRO_TEAM } from './espn.mjs';

export const TRADE_TYPES = ['TRADE_PROPOSAL', 'TRADE_ACCEPT', 'TRADE_UPHOLD', 'TRADE_VETO', 'TRADE_DECLINE', 'TRADE_ERROR'];

const isTrade = tx => typeof tx?.type === 'string' && tx.type.startsWith('TRADE');
const firstDate = (...xs) => xs.map(Number).filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b)[0] ?? null;

/**
 * Player name, position and NFL team for each ESPN player ID, from any roster-shaped response
 * (mRoster teams[].roster.entries[] or a box score's rosterForCurrentScoringPeriod).
 */
export function playersFromRosters(league, into = {}) {
  for (const t of league?.teams || []) {
    for (const e of t.roster?.entries || []) {
      const p = e.playerPoolEntry?.player;
      if (!p || p.id == null || into[p.id]) continue;
      into[p.id] = { n: p.fullName || String(p.id), p: POSITION[p.defaultPositionId] || '?', t: PRO_TEAM[p.proTeamId] ?? null };
    }
  }
  return into;
}

/**
 * @param transactions  every transaction row from mTransactions2, across all scoring periods fetched
 * @param players       { [playerId]: { n, p, t } } name lookup (league.json players + current rosters)
 * @returns trades, newest first: { id, date, status: 'pending' | 'done' | 'vetoed', sides: [{ rid, gets: [{ id, n, p, t }] }] }
 */
export function tradesFromTransactions(transactions = [], players = {}) {
  const rows = new Map();
  for (const tx of transactions) if (isTrade(tx) && tx.id != null) rows.set(tx.id, tx);

  // Group rows that point at each other (in either direction) into one trade, keyed by the
  // smallest ID in the group so the key stays the same from run to run.
  const parent = new Map();
  const find = x => { while (parent.has(x) && parent.get(x) !== x) x = parent.get(x); return x; };
  const join = (a, b) => {
    const [ra, rb] = [find(a), find(b)];
    if (ra === rb) return;
    String(ra) < String(rb) ? parent.set(rb, ra) : parent.set(ra, rb);
  };
  for (const tx of rows.values()) {
    if (!parent.has(tx.id)) parent.set(tx.id, tx.id);
    if (tx.relatedTransactionId) {
      if (!parent.has(tx.relatedTransactionId)) parent.set(tx.relatedTransactionId, tx.relatedTransactionId);
      join(tx.id, tx.relatedTransactionId);
    }
  }
  const groups = new Map();
  for (const tx of rows.values()) {
    const key = find(tx.id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }

  const out = [];
  for (const [id, txs] of groups) {
    const has = (type, status) => txs.some(t => t.type === type && (!status || t.status === status));
    const accepted = has('TRADE_ACCEPT') || has('TRADE_UPHOLD') || has('TRADE_PROPOSAL', 'EXECUTED');
    if (!accepted) continue; // offers nobody accepted are private business
    if (txs.every(t => t.status === 'CANCELED' || t.status === 'FAILED') && !has('TRADE_VETO')) continue;

    const vetoed = has('TRADE_VETO') || txs.some(t => t.status === 'VETOED');
    // An accepted trade still inside the review period stays pending until an uphold (or veto) row appears.
    const inReview = has('TRADE_ACCEPT', 'PENDING') && !has('TRADE_UPHOLD');
    const done = !vetoed && !inReview && (has('TRADE_UPHOLD') || txs.some(t => t.status === 'EXECUTED'));
    const status = vetoed ? 'vetoed' : done ? 'done' : 'pending';

    // The player moves: from whichever row lists them (proposal or accept carry the same items).
    const source = txs.find(t => (t.items || []).some(i => i.type === 'TRADE')) || txs[0];
    const byTeam = new Map();
    for (const it of source.items || []) {
      if (it.type !== 'TRADE' || it.toTeamId == null || it.playerId == null) continue;
      const p = players[it.playerId] || players[String(it.playerId)] || { n: `Player ${it.playerId}`, p: '?', t: null };
      if (!byTeam.has(it.toTeamId)) byTeam.set(it.toTeamId, []);
      byTeam.get(it.toTeamId).push({ id: String(it.playerId), n: p.n, p: p.p, t: p.t });
      if (it.fromTeamId != null && !byTeam.has(it.fromTeamId)) byTeam.set(it.fromTeamId, []);
    }
    if (!byTeam.size) continue;

    const acceptRow = txs.find(t => t.type === 'TRADE_ACCEPT');
    const date = firstDate(acceptRow?.proposedDate, acceptRow?.processDate)
      ?? firstDate(...txs.map(t => t.proposedDate), ...txs.map(t => t.processDate));
    out.push({
      id: String(id),
      date: date ? new Date(date).toISOString() : null,
      status,
      sides: [...byTeam].map(([rid, gets]) => ({ rid, gets })).sort((a, b) => a.rid - b.rid),
    });
  }
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// One line per distinct trade row: type, status, which date fields are set, how it links to other
// rows, and its item types. Field names and short ID prefixes only: no member data.
export function describeTransactions(transactions = []) {
  const seen = new Map();
  for (const t of transactions) if (t && t.id != null && !seen.has(t.id)) seen.set(t.id, t);
  const short = id => String(id).slice(0, 8);
  return [...seen.values()].filter(isTrade).map(t => {
    const rel = t.relatedTransactionId ? `${short(t.relatedTransactionId)}${seen.has(t.relatedTransactionId) ? '' : '(missing)'}` : '-';
    const items = (t.items || []).map(i => `${i.type}:${i.fromTeamId}>${i.toTeamId}`).join(',') || 'none';
    const dates = ['proposedDate', 'processDate', 'acceptedDate', 'expirationDate'].filter(k => t[k]).map(k => `${k}=${new Date(t[k]).toISOString().slice(0, 16)}`).join(' ');
    const keys = Object.keys(t).filter(k => !/member|owner|user|swid/i.test(k)).sort().join('|');
    return `${short(t.id)} ${t.type}/${t.status} sp=${t.scoringPeriodId} rel=${rel} team=${t.teamId} items=[${items}] ${dates} keys=${keys}`;
  });
}
