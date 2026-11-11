#!/usr/bin/env node
// Fact sheet for writing one week's recap: every matchup with the final score, margin, updated
// records, streaks, last week's score, best starters and the duds. Works on either league's
// site/data/league.json (Sleeper or ESPN). The numbers here are the source of truth for the recap.
//
//   node scripts/week-facts.mjs <league.json> [week]
import { readFileSync } from 'node:fs';

const [file, weekArg] = process.argv.slice(2);
if (!file) { console.error('usage: node scripts/week-facts.mjs <league.json> [week]'); process.exit(1); }
const data = JSON.parse(readFileSync(file, 'utf8'));
const completed = data.weeks.filter(w => w.complete).map(w => w.week);
const week = weekArg ? Number(weekArg) : Math.max(...completed);
const entry = data.weeks.find(w => w.week === week);
if (!entry) { console.error(`No week ${week} in ${file}.`); process.exit(1); }

const team = Object.fromEntries(data.teams.map(t => [t.rosterId, { label: (t.teamName && t.teamName.trim()) || (t.userId ? `Team ${t.name}` : t.name), user: t.name }]));
const player = id => data.players?.[id]?.n || id;

// Results per team through `week`, oldest first.
const results = {};
for (const wk of data.weeks) {
  if (wk.week > week || (!wk.complete && wk.week !== week)) continue;
  for (const m of wk.matchups) {
    if (m.teams.length !== 2) continue;
    const [a, b] = m.teams;
    for (const [x, y] of [[a, b], [b, a]]) {
      (results[x.rid] ||= []).push({ week: wk.week, pts: x.pts, opp: y.rid, r: x.pts > y.pts ? 'W' : x.pts < y.pts ? 'L' : 'T' });
    }
  }
}
const record = rid => { const r = results[rid] || []; const c = k => r.filter(x => x.r === k).length; return `${c('W')}-${c('L')}${c('T') ? '-' + c('T') : ''}`; };
const streak = rid => {
  const r = results[rid] || []; if (!r.length) return '-';
  const k = r[r.length - 1].r; let n = 0;
  for (let i = r.length - 1; i >= 0 && r[i].r === k; i--) n++;
  return `${k}${n}`;
};
const prevScore = rid => (results[rid] || []).filter(x => x.week < week).slice(-1)[0]?.pts;

const all = entry.matchups.flatMap(m => m.teams.map(t => t.pts)).sort((a, b) => b - a);
const f = n => (n == null ? '-' : n.toFixed(2));
console.log(`# ${data.league?.name || 'League'} — Week ${week} facts${entry.complete ? '' : ' (NOT FINAL)'}\n`);
console.log(`Week high ${f(all[0])}, low ${f(all[all.length - 1])}, average ${f(all.reduce((a, b) => a + b, 0) / all.length)}\n`);

const games = entry.matchups.filter(m => m.teams.length === 2).map(m => {
  const [w, l] = m.teams.slice().sort((a, b) => b.pts - a.pts);
  return { w, l, margin: w.pts - l.pts };
});
for (const { w, l, margin } of games) {
  console.log(`## ${team[w.rid].label} ${f(w.pts)} def. ${team[l.rid].label} ${f(l.pts)} (margin ${f(margin)})`);
  for (const side of [w, l]) {
    const t = team[side.rid];
    const st = (side.starters || []).slice().sort((a, b) => b.pts - a.pts);
    const top = st.slice(0, 3).map(p => `${player(p.id)} ${p.pts}`).join(', ');
    const duds = st.filter(p => p.pts <= 3).map(p => `${player(p.id)} ${p.pts}`).join(', ');
    console.log(`- ${t.label}${t.user !== t.label ? ` (${t.user})` : ''}: now ${record(side.rid)}, streak ${streak(side.rid)}, last week ${f(prevScore(side.rid))}, week rank ${all.indexOf(side.pts) + 1}/${all.length}`);
    console.log(`  - top: ${top || '-'}`);
    if (duds) console.log(`  - duds (3 or fewer): ${duds}`);
  }
  console.log('');
}
console.log('Bench points are not in the site data yet: check the app for benched blow-ups before writing about them.');
