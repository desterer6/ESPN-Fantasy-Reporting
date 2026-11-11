# Power rankings (Option B)

## Formula

Record-first weighted model, 100 points total:

| Category | Weight | How it's measured |
|---|---|---|
| Record | 40 | Win% x 40 (ties count half) |
| Season points for | 25 | Min-max within the league: best PF gets 25, worst gets 0 |
| Recent performance | 15 | Average score over the last 3 weeks, min-max |
| Roster strength | 10 | Next week's projected starting-lineup score, min-max |
| Points against | 5 | Min-max: the toughest schedule gets 5 |
| Lineup decisions | 5 | Not measured yet, so everyone gets a neutral 2.5 |

Min-max: `N(x) = (x - league min) / (league max - league min)`.
Ties in total score go to the better record, then to more PF.

## Running it

```
node scripts/power-rankings.mjs site/data/league.json 10 --proj proj.json --prev prev.json
```

- `proj.json` holds next week's projected lineup score per team, read off the ESPN or Sleeper
  matchup screen, for example `{"I'm all JAGged up": 107.96, "Author CGreer": 126.47}`.
  The site data doesn't include projections yet, so this is the one number entered by hand.
- `prev.json` holds last week's published ranks, `{"Author CGreer": 8, ...}`, for movement markers.
  Running with `--json` saves a scorecard you can turn into next week's `prev.json`.
- Tiers split the list at the biggest score gaps (`--tiers 5` by default), so a tier is a group of
  teams the numbers say are close. Write a new funny name for each tier every week.

## Check against the published Week 9 rankings

The script was run on the live ESPN data for Fayetteville's Finest Week 9. Record, PF, recent and
PA match the published scorecard to the hundredth for every team checked: Tucker 31.11 / 25.00 /
15.00 / 3.76 and Gage 35.56 / 11.04 / 0.00 / 0.00. The only gap is the roster category, which needs
the hand-entered projections (Tucker 6.60, Gage 6.70 in the published version). Silas, who got 0
roster points, matches exactly at 12.94.

## Known limitations

- Min-max lets one extreme week stretch the scale for everyone.
- Recent scoring is also inside season PF, so high scoring counts twice.
- Roster strength is a one-week projection, so byes and injuries swing it.
- PA rewards schedule bad luck rather than team quality.
- Lineup decisions give no separation until bench data is added.

## Open decisions for David

These change what the rankings mean, so they are David's call. Until he decides, keep Option B as is.

1. **Record dominance.** Should an 8-1 team generally outrank a 5-4 team, or can big scoring overcome it?
   Under Option B, Gage at 8-1 ranked 5th in Week 9.
2. **Schedule luck.** Should a high PA raise a team's score, or only be mentioned in the write-up?
3. **Looking back or forward.** Should the rankings describe how teams have played, or how strong
   they'll be from here? This decides how roster and lineup quality should be measured.
