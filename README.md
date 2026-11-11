# Fayetteville's Finest Fantasy

An interactive, mobile-friendly analytics site for an **ESPN Fantasy Football** league.
A free scheduled GitHub Action pulls the league from ESPN, checks it, and publishes a static site.
No servers, no database, no AI, no manual data entry, and no cost.

- **Home**: standings, headline stats (leader, luckiest/unluckiest, top score), weekly results
- **History**: rank-by-week chart, points-by-week heat table, results for any week
- **Data**
  - **Schedule analysis**: every team's record against every other team's schedule, record against all teams by week, schedule luck and record against the weekly median
  - **Roster analysis**: top-heavy share, concentration curves, dependency on the top scorer, position mix, and points vs. league average by position

## How it works

```
ESPN API  →  scripts/fetch.mjs  →  scripts/espn.mjs (clean + transform)  →  site/data/league.json  →  site/  →  GitHub Pages
                                                     tests/verify.mjs checks it before every deploy  ↑
```

| Path | What it is |
|---|---|
| `config.json` | League ID and (optional) season. Can be left blank and set as repository variables instead |
| `scripts/fetch.mjs` | Network + files only: calls ESPN, hands the responses to `espn.mjs`, writes `site/data/league.json` |
| `scripts/espn.mjs` | Pure ESPN → site transform (no I/O). The only file that knows ESPN's format |
| `site/js/analytics.js` | All calculations (pure functions, shared by the site and the tests) |
| `site/js/pages/` | One file per page: `home`, `history`, `schedule`, `roster` |
| `tests/transform.test.mjs` | Offline tests of the transform against a fictional fixture in `tests/fixtures/` |
| `tests/verify.mjs` | Checks the real data before deploy: records match ESPN, weekly math adds up, and no personal data |
| `.github/workflows/update.yml` | Scheduled refresh: test → fetch → verify → commit data → deploy |

No build step and no dependencies: plain ES modules, Node 18+.

## One-time setup

1. **League ID**: open the league on fantasy.espn.com; it is the `leagueId=` number in the address bar.
   Put it in `config.json` (`"leagueId": "12345678"`) or add a repository **variable** `ESPN_LEAGUE_ID`
   (Settings → Secrets and variables → Actions → Variables).
2. **Private league only** (ESPN's default): add two repository **secrets** (Settings → Secrets and variables → Actions → Secrets):
   - `ESPN_S2`: the `espn_s2` cookie
   - `SWID`: the `SWID` cookie, including the curly braces

   To find them: sign in at fantasy.espn.com in a desktop browser → Developer tools → Application (Chrome) / Storage (Firefox) → Cookies → `https://fantasy.espn.com`.
   They act like a password for your ESPN account: only ever paste them into GitHub secrets, never into a file, issue, chat or commit. They last about a year; when the workflow fails with "ESPN refused access", refresh them.
3. **Hosting**: Settings → Pages → Build and deployment → Source: **GitHub Actions**.
4. Actions tab → *Update data and deploy* → **Run workflow**. The site appears at `https://<username>.github.io/Fayettvilles-Finest-Fantasy/`.

## Automatic updates

The workflow runs Sunday night (live scores), Tuesday early morning (final scores after Monday Night Football) and Friday early morning (Thursday game and ESPN stat corrections), on every push that touches the site or scripts, and on demand from the Actions tab.
If the data changed it commits `site/data/league.json`; if any check fails nothing is deployed and the previous site stays up.

A week counts as *completed* once ESPN has decided every matchup in it. The in-progress week appears on Home as live scores but is excluded from all analysis.

GitHub pauses scheduled workflows in public repos after 60 days with no commits (e.g. the off-season). If that happens, re-enable it from the Actions tab before the next season.

**New season**: nothing to do. The season is picked automatically (Aug–Dec = that year, Jan–Jul = previous year). To pin one, set `season` in `config.json` or the `ESPN_SEASON` variable.

## Privacy and security

- **Published**: team names, scores, and NFL player names/points. That's it.
- **Never published or stored**: ESPN member names, emails, member IDs (SWIDs) or cookies. `scripts/espn.mjs` never copies them, and `tests/verify.mjs` fails the deploy if any such field shows up.
- Cookies exist only as encrypted GitHub secrets, are sent only to ESPN, and are never logged.
- Everything under `site/` (including `league.json`) is visible to anyone with the link. Share the link with your league, but treat it as public.
- The workflow uses least-privilege permissions per job; Dependabot keeps the Actions it uses up to date.

## Run it locally

```bash
node scripts/demo.mjs            # fictional demo data, no ESPN needed
node scripts/serve.mjs           # then open http://localhost:8080
npm test                         # transform tests + data checks

# Real data (private league: export the cookies in your shell, never in a file in this repo)
ESPN_LEAGUE_ID=12345678 ESPN_S2='...' SWID='{...}' node scripts/fetch.mjs
```

Don't commit demo data; the scheduled workflow overwrites `site/data/league.json`.

## Optional: Cloudflare Pages instead of GitHub Pages

Works with a private repo. Create a Pages project from this repo (build command: none, output directory: `site`), then add a repository variable `DEPLOY_PAGES` = `false` so the GitHub Pages deploy is skipped. The workflow still refreshes and commits the data, and Cloudflare redeploys on each commit.

## Definitions

- **Schedule pivot**: team A's weekly scores replayed against team B's opponents. In the week B played A, A would face itself, so that week uses A's real head-to-head result. The diagonal is each team's real record.
- **Luck**: actual wins minus the wins a team's scoring would earn on an average schedule.
- **vs. median**: win if a team's score beats the league median that week.
- **Effective players**: 1 ÷ Σ(share²) of each player's share of team points. Lower means more concentrated.
- **Roster analysis** uses starters' points only (kickers and D/ST included), grouped by each player's real position.

## Credits and license

Site design and analytics adapted from [YellowstoneFFL](https://github.com/lathangregg/YellowstoneFFL) by Lathan Gregg (MIT). MIT, see [LICENSE](LICENSE).
ESPN's API is unofficial and undocumented; if ESPN changes it, only `scripts/espn.mjs` and `scripts/fetch.mjs` should need updating.
League data belongs to ESPN and the league members.
