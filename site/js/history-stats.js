// League history math (pure, no DOM): all-time standings, record book and one season's summary.
// Input is site/data/history.json, built by scripts/fetch-history.mjs. Teams are matched across
// seasons by ESPN's team id, the same franchise slot each year.

const nameIn = (season, id) => season.teams.find(t => t.id === id)?.name ?? `Team ${id}`;
const titleGames = s => {
  const fin = s.games.filter(g => g.po === 1);
  if (!fin.length) return [];
  const last = Math.max(...fin.map(g => g.w));
  return fin.filter(g => g.w === last);
};

export function allTime(hist) {
  const rows = new Map();
  // Newest first, so the first name seen is the current one.
  const seasons = [...(hist?.seasons || [])].sort((a, b) => b.season - a.season);
  for (const s of seasons) {
    const inPlayoffs = new Set(s.games.filter(g => g.po === 1).flatMap(g => [g.h, g.a]));
    const finalists = new Set(s.complete ? [s.champion, s.runnerUp].filter(x => x != null) : []);
    for (const t of s.teams) {
      const r = rows.get(t.id) || { id: t.id, name: t.name, seasons: 0, w: 0, l: 0, t: 0, pf: 0, pa: 0, titles: 0, finals: 0, playoffs: 0, years: [], titleYears: [] };
      r.seasons++; r.w += t.w; r.l += t.l; r.t += t.t; r.pf += t.pf; r.pa += t.pa;
      r.years.push(s.season);
      if (inPlayoffs.has(t.id)) r.playoffs++;
      if (finalists.has(t.id)) r.finals++;
      if (s.champion === t.id) { r.titles++; r.titleYears.push(s.season); }
      rows.set(t.id, r);
    }
  }
  return [...rows.values()].map(r => {
    const gp = r.w + r.l + r.t;
    return { ...r, pf: Math.round(r.pf * 100) / 100, pa: Math.round(r.pa * 100) / 100, pct: gp ? (r.w + r.t / 2) / gp : 0 };
  }).sort((a, b) => b.titles - a.titles || b.pct - a.pct || b.pf - a.pf);
}

export function recordBook(hist) {
  const seasons = [...(hist?.seasons || [])].sort((a, b) => a.season - b.season);
  const scores = [], games = [], years = [];
  for (const s of seasons) {
    for (const g of s.games) {
      const base = { season: s.season, week: g.w, po: g.po };
      scores.push({ ...base, id: g.h, name: nameIn(s, g.h), pts: g.hp, opp: g.a, oppName: nameIn(s, g.a), oppPts: g.ap });
      scores.push({ ...base, id: g.a, name: nameIn(s, g.a), pts: g.ap, opp: g.h, oppName: nameIn(s, g.h), oppPts: g.hp });
      if (g.win) {
        const winH = g.win === g.h;
        games.push({ ...base, id: g.win, name: nameIn(s, g.win), pts: winH ? g.hp : g.ap, opp: winH ? g.a : g.h,
          oppName: nameIn(s, winH ? g.a : g.h), oppPts: winH ? g.ap : g.hp, margin: Math.round(Math.abs(g.hp - g.ap) * 100) / 100 });
      }
    }
    for (const t of s.teams) {
      const gp = t.w + t.l + t.t;
      if (gp) years.push({ season: s.season, id: t.id, name: t.name, w: t.w, l: t.l, t: t.t, pf: t.pf, pct: (t.w + t.t / 2) / gp });
    }
  }
  // Scores of 0 are usually forfeits or empty slots in very old seasons; leave them out of "lowest".
  const real = scores.filter(x => x.pts > 0);
  const pick = (arr, better) => arr.reduce((best, x) => (best == null || better(x, best) ? x : best), null);
  return {
    high: pick(scores, (x, b) => x.pts > b.pts),
    low: pick(real, (x, b) => x.pts < b.pts),
    blowout: pick(games, (x, b) => x.margin > b.margin),
    closest: pick(games.filter(x => x.margin > 0), (x, b) => x.margin < b.margin),
    bestSeason: pick(years, (x, b) => x.pct > b.pct || (x.pct === b.pct && x.pf > b.pf)),
    mostPoints: pick(years, (x, b) => x.pf > b.pf),
    topScores: scores.slice().sort((a, b) => b.pts - a.pts).slice(0, 10),
  };
}

export function seasonSummary(s) {
  const standings = s.teams.slice().sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99) ||
    (b.w + b.t / 2) - (a.w + a.t / 2) || b.pf - a.pf);
  const regTop = s.teams.slice().sort((a, b) => (b.w + b.t / 2) - (a.w + a.t / 2) || b.pf - a.pf)[0] || null;
  const weeks = [...new Set(s.games.filter(g => g.po === 1).map(g => g.w))].sort((a, b) => a - b);
  const playoffRounds = weeks.map(w => ({ week: w, games: s.games.filter(g => g.po === 1 && g.w === w) }));
  return { standings, regTop, playoffRounds, final: titleGames(s)[0] || null, finalRank: s.teams.some(t => t.rank) };
}
