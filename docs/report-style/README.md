# Weekly report playbook

Everything needed to write David's weekly reports for his two leagues, kept in the repo so it
survives between sessions. Read these files before writing anything.

| File | What it covers |
|---|---|
| [voice.md](voice.md) | Tone, format and the rules learned from David's edits |
| [leagues.md](leagues.md) | Who manages which team in each league, and the running storylines |
| [power-rankings.md](power-rankings.md) | The Option B formula, how to run it, and the open questions |
| [matchup-to-watch.md](matchup-to-watch.md) | How the spotlight matchup is picked |
| [used-references.md](used-references.md) | Every published bit and tier name, plus the freshness rules |
| [examples/](examples/) | David's published reports, the gold standard for tone |
| [archive/](archive/) | David's recovered final power rankings (Weeks 7-9) and matchups to watch (Weeks 8-10), verbatim |
| [history/](history/) | Recovered Week 1-7 facts for both leagues: scores, rankings, picks, team renames |
| [baselines/](baselines/) | Last published rank per team, the `--prev` file for movement markers |

## The two leagues are separate

| League | Platform | Data file |
|---|---|---|
| Fayetteville's Finest (12 teams, 8 make the playoffs) | ESPN, league 881332199 | `site/data/league.json` in this repo |
| Yellowstone Ranch - Fayetteville (14 teams, 6 make the playoffs) | Sleeper, league 1396013788037156864 | `site/data/league.json` in `lathangregg/yellowstoneffl` |

Never mix them. The same NFL players (CeeDee Lamb, Derrick Henry and others) appear in both, so
always check which league a stat came from. Track each manager as one organization even when the
team name changes (Gage: "Im in RA" became "Im No Longer in RA").

## Weekly workflow (Tuesday, after Monday Night Football)

David has written every 2026 report through Week 9. Don't write reports for past weeks. Start
with Week 10, and only once David says the week is complete.

Both sites refresh final scores Tuesday around 4 AM Central. Pull the latest data first.

1. **Facts.** `node scripts/week-facts.mjs site/data/league.json <week>` (and the same against the
   Yellowstone file). Every score, margin, record, streak and top/dud starter in the recap must come
   from this output. Bench points aren't in the data, so confirm benched blow-ups in the app.
2. **Recap.** One section per matchup, written in the voice in [voice.md](voice.md). Check
   [used-references.md](used-references.md) first so nothing is recycled, and find one current hook from that week.
3. **Power rankings.** `node scripts/power-rankings.mjs <league.json> <week> --prev baselines/<league>-week<NN-1>.json`
   (Yellowstone also needs `--proj`).
   Use the computed order and tiers, write fresh tier names, add the movement markers and the
   "intelligence report" paragraph.
4. **Matchup to watch.** Pick next week's spotlight with [matchup-to-watch.md](matchup-to-watch.md).
5. **Validate** with the checklist below, then hand David a copy-and-paste block per league.
6. **Archive.** Save David's final edited version to `examples/`, log its bits in `used-references.md`, and the scorecard JSON
   as next week's baseline in `baselines/<league>-week<NN>.json` (team name to published rank). His edit, not the draft, is the reference.

## Validation checklist

- Winner has the higher score and the margin is right.
- Every record moved by exactly one game, and streaks continued or reset correctly.
- Movement markers compare to the last *published* power ranking, not the standings.
- Playoff talk matches the real bracket (Fayetteville's Finest: top 8 of 12).
- Projections quoted for Fayetteville's Finest come from ESPN, and for Yellowstone from Sleeper.
- No comparison, punchline or tier name repeats anything in [used-references.md](used-references.md) from the last 4 weeks.

## Publishing

The Fayetteville's Finest site takes the report through the **Weekly report** issue form in this
repo (Week, Headline, Report). Only issues David opens are published.
