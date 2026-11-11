# Fayetteville's Finest Fantasy

A sports-page style site for an **ESPN Fantasy Football** league.
A free scheduled GitHub Action pulls the league from ESPN, checks it, and publishes a static site.
No servers, no database, no AI, no manual data entry, and no cost.

- **Masthead + ticker**: scrolling headlines (approved league news, the latest report, live scores, streaks and weekly superlatives) and a scoreboard strip for the latest week
- **Home**: lead story (latest weekly report, or an automatic recap), week by the numbers, league news, season leaders, standings and power index
- **Scores**: box scores for any week with each team's top starters
- **Standings**: W-L, PF/PA, streak, all-play record and luck
- **Weekly Report**: the commissioner's report, posted from a GitHub issue (owner only)
- **News**: stories submitted by members through a Google Form and approved by the commissioner
- **Stats Lab**: season history, schedule luck and roster breakdowns

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
| `scripts/content.mjs` | Pure parsing of weekly-report issues and the news sheet (owner/approval rules live here) |
| `scripts/fetch-content.mjs` | Reads the issues and the news sheet, writes `site/data/content.json` |
| `site/js/insights.js` | Rule-based storylines: weekly superlatives, streaks, power index, ticker items |
| `site/js/markdown.js` | Small, safe Markdown renderer for reports (escapes all HTML) |
| `site/js/pages/` | One file per page: `home`, `scores`, `standings`, `reports`, `news`, `history`, `schedule`, `roster` |
| `tests/transform.test.mjs` | Offline tests of the ESPN transform against a fictional fixture in `tests/fixtures/` |
| `tests/content.test.mjs` | Offline tests of reports, news approval and Markdown safety |
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
4. Actions tab → *Update data and deploy* → **Run workflow**. The site appears at `https://<username>.github.io/Fayettevilles-Finest-Fantasy/`.

## Posting the weekly report (owner only, no login on the site)

Every Tuesday after Monday Night Football:
1. Go to **Issues → New issue → Weekly report (commissioner)** in this repo (works from the GitHub phone app too).
2. Fill in the week, a headline, and paste the report. Submit.
3. The site updates in about two minutes; the report becomes the lead story on Home and the ticker.

Only issues opened by the repository owner are published, so nobody else can post a report even though anyone can open issues.
GitHub's own sign-in is the lock; the site itself has no login. To fix a typo, edit the issue. To take a report down, add the `hidden` label or close the issue.
Formatting: `## Heading`, `**bold**`, `*italic*`, `- list`, `> quote`, `[text](https://link)`. Any HTML you paste is shown as plain text, never run.

## League news (Google Form, approved by the owner)

Members submit stories through a Google Form, with no account needed. Nothing appears until the owner ticks **Approved** in the responses sheet.

One-time setup (about 5 minutes):
1. Create a Google Form with three questions, titled exactly: **Headline** (short answer, required), **Story** (paragraph), **Byline** (short answer, optional: "Name or nickname to show, or leave blank").
   In Settings → Responses, set **Collect email addresses** to *Do not collect*.
2. Responses tab → **Link to Sheets** → create a new spreadsheet.
3. In that sheet, add a column header **Approved** right after the last column, and turn that column into checkboxes (Insert → Checkbox).
4. Add a second tab named **Published**. In cell A1 paste:
   `=QUERY('Form Responses 1'!A:E, "select A,B,C,D where E = true", 1)`
   This tab only ever shows approved stories.
5. File → Share → **Publish to web** → choose the **Published** tab (not the whole document) and **Comma-separated values (.csv)** → Publish. Copy the link.
6. Put two values in `config.json`: `newsSheetCsvUrl` (the CSV link from step 5) and `newsFormUrl` (the form's Send → link).

To approve a story, tick its checkbox. The site picks it up at the next run (twice daily, plus the game-day runs) or right away with Actions → Run workflow.
Only the Published tab is public; unapproved submissions stay private in your sheet.

## Past weekly reports (archive)

Your earlier reports live in `reports/archive/`, one Markdown file per week, word for word. Each
file starts with `week`, `season`, `title` and `date` lines, then `---`, then the report. Add a file to
publish another past week. They appear on the Weekly Report page next to the ones you post as issues.

## Posting news yourself

Add a file to `news/` (for example `news/2026-11-11-trade-deadline.md`) with `headline`, `byline` and
`date` lines, then `---`, then the story. It shows on the News page and the scrolling banner within a
couple of minutes. Delete the file to take it down.

## League history

The **League History** tab shows every past season ESPN has for the league: champions, all-time standings, a record book and each season's final standings and playoffs. `scripts/fetch-history.mjs` pulls it during the normal update and saves it in `site/data/history.json`. Finished seasons are fetched once and then kept; a season is added automatically once it is over. Only team names and scores are saved. Teams are matched across seasons by their ESPN team slot.

## Undoing a change

- **Hide the archived reports:** set `"showArchivedReports": false` in `config.json` (edit it on GitHub). The site updates in a couple of minutes. Set it back to `true` to show them again.
- **Undo anything:** Actions tab → **Undo a change** → Run workflow. Choose `restore-to-point` and paste a commit SHA to put the site back to that moment (`7d25188` is the site just before the archive was added), or `undo-one-commit` to reverse a single commit. Live league data is kept, and the undo is itself a commit you can undo.

## League rules

- **Playoffs:** the bracket size comes from ESPN's league settings (8 teams here), seeded by ESPN. No consolation bracket.
- **Relegation:** `"relegation": 1` in `config.json` marks last place as relegated. The Playoffs page highlights the team(s) in the relegation zone and shows each team's chance of finishing last. Set it to `0` to turn it off.

## Automatic updates

The workflow runs Sunday night (live scores), Tuesday early morning (final scores after Monday Night Football), Friday early morning (Thursday game and ESPN stat corrections), twice a day for news, whenever the owner posts or edits a weekly report, on every push that touches the site or scripts, and on demand from the Actions tab.
If the data changed it commits `site/data/league.json` and `site/data/content.json`. If a check fails nothing is deployed and the previous site stays up.
If only ESPN fails (outage or expired cookies), new reports and news still go live with the last good scores, and the run is marked failed so GitHub emails you.

A week counts as *completed* once ESPN has decided every matchup in it. The in-progress week appears on Home as live scores but is excluded from all analysis.

GitHub pauses scheduled workflows in public repos after 60 days with no commits (e.g. the off-season). If that happens, re-enable it from the Actions tab before the next season.

**New season**: nothing to do. The season is picked automatically (Aug–Dec = that year, Jan–Jul = previous year). To pin one, set `season` in `config.json` or the `ESPN_SEASON` variable.

## Privacy and security

- **Published**: team names, scores, NFL player names/points, the owner's weekly reports, and approved news stories (with a byline only if the submitter typed one).
- **Not published**: GitHub usernames of report authors, unapproved news, and anything from the news form beyond headline/story/byline. The form should not collect emails.
- **Never published or stored**: ESPN member names, emails, member IDs (SWIDs) or cookies. `scripts/espn.mjs` never copies them, and `tests/verify.mjs` fails the deploy if any such field shows up.
- Cookies exist only as encrypted GitHub secrets, are sent only to ESPN, and are never logged.
- Everything under `site/` (including `league.json`) is visible to anyone with the link. Share the link with your league, but treat it as public.
- The workflow uses least-privilege permissions per job; Dependabot keeps the Actions it uses up to date.
- The page sets a strict Content-Security-Policy (only its own scripts, styles, fonts and data), fonts are self-hosted, and no analytics or trackers are loaded, so visitors' browsers talk to nothing but this site.
- Reports and news are rendered as escaped text; pasted HTML or scripts are never executed (see `tests/content.test.mjs`).

## Run it locally

```bash
node scripts/demo.mjs            # fictional demo data (scores, a report, two news stories), no ESPN needed
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
