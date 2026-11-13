// Trades from ESPN -> automatic news stories, on fictional data. No network: node tests/trades.test.mjs
import { tradesFromTransactions, playersFromRosters } from '../scripts/trades.mjs';
import { tradeNews, withTradeNews, seasonTrades, seasonLabel } from '../site/js/trades.js';
import { newsFromFiles } from '../scripts/content.mjs';
import { privacyChecks } from './checks.mjs';

let failed = 0, passed = 0;
const ok = (cond, msg) => { cond ? passed++ : (failed++, console.error('FAIL:', msg)); };

// Fictional players and teams.
const rosters = { teams: [
  { id: 1, roster: { entries: [{ playerPoolEntry: { player: { id: 101, fullName: 'Ace Runner', defaultPositionId: 2, proTeamId: 11 } } }] } },
  { id: 2, roster: { entries: [
    { playerPoolEntry: { player: { id: 202, fullName: 'Rookie Back', defaultPositionId: 2, proTeamId: 3 } } },
    { playerPoolEntry: { player: { id: 203, fullName: 'Deep Threat', defaultPositionId: 3, proTeamId: 21 } } },
  ] } },
] };
const players = playersFromRosters(rosters, { 999: { n: 'Old Starter', p: 'QB', t: 'KC' } });
ok(players[101].n === 'Ace Runner' && players[101].p === 'RB' && players[101].t === 'IND', 'player name, position and team from rosters');
ok(players[999].n === 'Old Starter', 'existing names kept');

const T = Date.UTC(2026, 10, 13, 14, 49);
const tx = [
  // Trade A: pending the league vote (proposal + accept).
  { id: 'a1', type: 'TRADE_PROPOSAL', status: 'PENDING', proposedDate: T - 3600e3, memberId: '{11111111-2222-3333-4444-555555555555}',
    items: [{ type: 'TRADE', playerId: 202, fromTeamId: 2, toTeamId: 1 }, { type: 'TRADE', playerId: 101, fromTeamId: 1, toTeamId: 2 }] },
  { id: 'a2', type: 'TRADE_ACCEPT', status: 'PENDING', relatedTransactionId: 'a1', proposedDate: T,
    items: [{ type: 'TRADE', playerId: 202, fromTeamId: 2, toTeamId: 1 }, { type: 'TRADE', playerId: 101, fromTeamId: 1, toTeamId: 2 }] },
  // Trade B: went through (uphold executed), three players one way.
  { id: 'b1', type: 'TRADE_PROPOSAL', status: 'EXECUTED', proposedDate: T - 9 * 86400e3,
    items: [{ type: 'TRADE', playerId: 203, fromTeamId: 2, toTeamId: 3 }, { type: 'TRADE', playerId: 999, fromTeamId: 2, toTeamId: 3 },
      { type: 'TRADE', playerId: 555, fromTeamId: 2, toTeamId: 3 }, { type: 'TRADE', playerId: 444, fromTeamId: 3, toTeamId: 2 }] },
  { id: 'b2', type: 'TRADE_UPHOLD', status: 'EXECUTED', relatedTransactionId: 'b1', processDate: T - 7 * 86400e3 },
  // Trade C: vetoed.
  { id: 'c1', type: 'TRADE_ACCEPT', status: 'CANCELED', proposedDate: T - 20 * 86400e3, items: [{ type: 'TRADE', playerId: 101, fromTeamId: 1, toTeamId: 3 }] },
  { id: 'c2', type: 'TRADE_VETO', status: 'EXECUTED', relatedTransactionId: 'c1', processDate: T - 19 * 86400e3 },
  // Never accepted or declined: never published.
  { id: 'd1', type: 'TRADE_PROPOSAL', status: 'PENDING', items: [{ type: 'TRADE', playerId: 101, fromTeamId: 1, toTeamId: 4 }] },
  { id: 'e1', type: 'TRADE_PROPOSAL', status: 'CANCELED', items: [{ type: 'TRADE', playerId: 101, fromTeamId: 1, toTeamId: 4 }] },
  { id: 'e2', type: 'TRADE_DECLINE', status: 'EXECUTED', relatedTransactionId: 'e1' },
  // Not a trade.
  { id: 'w1', type: 'WAIVER', status: 'EXECUTED', items: [{ type: 'ADD', playerId: 7, toTeamId: 1 }] },
];
const trades = tradesFromTransactions(tx, players);
ok(trades.length === 3, `three accepted trades (got ${trades.length}: ${trades.map(t => t.id)})`);
const [a, b, c] = trades;
ok(a.id === 'a1' && a.status === 'pending', 'pending trade grouped under the proposal');
ok(a.date === new Date(T).toISOString(), 'date is when it was accepted');
ok(a.sides.length === 2 && a.sides[0].rid === 1 && a.sides[0].gets[0].n === 'Rookie Back', 'who gets what');
ok(b.status === 'done' && b.sides.find(s => s.rid === 3).gets.length === 3, 'upheld trade is done');
ok(b.sides.find(s => s.rid === 3).gets.some(g => g.n === 'Player 555'), 'unknown player falls back to the ID');
ok(c.status === 'vetoed', 'vetoed trade');
ok(tradesFromTransactions([...tx].reverse(), players).map(t => t.id).join() === trades.map(t => t.id).join(), 'same IDs whatever the row order');
const shapes = JSON.stringify(trades);
ok(!shapes.includes('memberId') && !shapes.includes('1111'), 'member IDs never copied');
privacyChecks({ trades }, ok);

// News stories built from the trades.
const teams = [1, 2, 3].map(id => ({ rosterId: id, name: `Team ${'XYZ'[id - 1]}`, official: { w: id + 3, l: 6 - id, t: 0 } }));
const byRid = Object.fromEntries(teams.map(t => [t.rosterId, t]));
const ctx = { data: { trades }, byRid, name: rid => byRid[rid].name };
const news = tradeNews(ctx);
ok(news.length === 3, 'one story per trade');
ok(news[0].id === 't-a1' && news[0].headline.startsWith('TRADE ALERT') && news[0].headline.includes('headed to'), `pending headline: ${news[0].headline}`);
ok(news[0].story.includes('Team X gets: Rookie Back (CHI RB)') && news[0].story.includes('league vote'), 'pending story');
ok(news[0].story.includes('Team X (4-5) and Team Y (5-4)'), 'records in the story');
ok(news[1].headline.startsWith('BLOCKBUSTER TRADE') && news[1].story.includes('OFFICIAL'), `four players is a blockbuster: ${news[1].headline}`);
ok(news[2].headline.startsWith('TRADE VETOED') && news[2].headline.includes('stays put'), `vetoed headline: ${news[2].headline}`);

// A hand-written story with a "trade:" line replaces the automatic one.
const posts = newsFromFiles([{ name: '2026-11-13-trade.md', text: 'headline: BIG TRADE\ndate: 2026-11-13T15:00:00Z\ntrade: Rookie Back, ace runner\n---\nHand written.' }]);
ok(JSON.stringify(posts[0].trade) === '["Rookie Back","ace runner"]', 'trade line parsed');
const merged = withTradeNews(ctx, { news: posts, reports: [] });
ok(merged.news.length === 3 && !merged.news.some(n => n.id === 't-a1'), 'hand-written trade story wins');
ok(merged.news[0].headline === 'BIG TRADE', 'merged news newest first');
ok(tradeNews({ ...ctx, data: {} }).length === 0, 'no trades in older data files');
ok(newsFromFiles([{ name: 'x.md', text: `headline: Long\n---\n${'a'.repeat(3000)}` }])[0].story.length === 3000, 'owner posts can run longer than reader submissions');

// Trade Reports block on the Reports tab.
ok(seasonLabel('2026') === '2026-27' && seasonLabel(2099) === '2099-00' && seasonLabel(null) === '', 'season label rolls over by year');
const rows = seasonTrades(ctx, { news: posts });
ok(rows.length === 3 && rows[0].id === 'a1', 'every trade listed, newest first');
ok(rows[0].href === '#/news/c-2026-11-13-trade', 'trade links to the hand-written story when there is one');
ok(rows[1].href === '#/news/t-b1', 'otherwise to the automatic story');
ok(rows[0].sides[0].name === 'Team X' && rows[0].sides[0].gets[0] === 'Rookie Back', 'who got what');

// An accepted trade still in review stays pending even if another row in its group says EXECUTED.
const review = tradesFromTransactions([
  { id: 'p1', type: 'TRADE_PROPOSAL', status: 'EXECUTED', items: [{ type: 'TRADE', playerId: 101, fromTeamId: 1, toTeamId: 2 }, { type: 'TRADE', playerId: 202, fromTeamId: 2, toTeamId: 1 }] },
  { id: 'p2', type: 'TRADE_ACCEPT', status: 'PENDING', relatedTransactionId: 'p1', proposedDate: T },
], players);
ok(review[0].status === 'pending', `in-review trade is pending (got ${review[0].status})`);

console.log(`${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
