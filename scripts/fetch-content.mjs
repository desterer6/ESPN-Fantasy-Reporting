// Collects weekly reports and approved news, writes site/data/content.json.
// Run with: node scripts/fetch-content.mjs
//
// Environment (set automatically inside GitHub Actions):
//   GITHUB_REPOSITORY   owner/repo whose issues hold the weekly reports
//   GITHUB_TOKEN        read token for the issues API (optional for a public repo, but avoids rate limits)
// config.json:
//   newsFormUrl         public link to the news submission form (shown on the site)
//   newsSheetCsvUrl     "Publish to web" CSV link of the Google Sheet with news submissions
//   showArchivedReports false hides the past reports in reports/archive/ (quick undo; default true)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContent } from './content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(await fs.readFile(path.join(root, 'config.json'), 'utf8'));
const repo = process.env.GITHUB_REPOSITORY || cfg.repository || '';
const token = process.env.GITHUB_TOKEN;
const dest = path.join(root, 'site', 'data', 'content.json');

async function issuesWith(label) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return [];
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const url = `https://api.github.com/repos/${repo}/issues?state=all&labels=${encodeURIComponent(label)}&per_page=100&page=${page}`;
    const res = await fetch(url, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'league-report-site', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    if (!res.ok) throw new Error(`GitHub issues ${res.status} for label ${label}`);
    const batch = await res.json();
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

async function sheetCsv(url) {
  if (!url) return '';
  if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(url)) throw new Error('newsSheetCsvUrl must be a docs.google.com/spreadsheets link');
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'league-report-site' } });
  if (!res.ok) throw new Error(`News sheet ${res.status}`);
  return res.text();
}

// Past reports kept in the repo (reports/archive/*.md), unless switched off in config.json.
async function archiveFiles() {
  if (cfg.showArchivedReports === false) return [];
  const dir = path.join(root, 'reports', 'archive');
  let names = [];
  try { names = (await fs.readdir(dir)).filter(n => n.endsWith('.md')).sort(); } catch { return []; }
  return Promise.all(names.map(async name => ({ name, text: await fs.readFile(path.join(dir, name), 'utf8') })));
}
const archive = await archiveFiles();

// News the owner posts directly (news/*.md).
async function postFiles() {
  const dir = path.join(root, 'news');
  let names = [];
  try { names = (await fs.readdir(dir)).filter(n => n.endsWith('.md')).sort(); } catch { return []; }
  return Promise.all(names.map(async name => ({ name, text: await fs.readFile(path.join(dir, name), 'utf8') })));
}
const posts = await postFiles();

let prev = null;
try { prev = JSON.parse(await fs.readFile(dest, 'utf8')); } catch { /* first run */ }

try {
  const [issues, csv] = await Promise.all([issuesWith('weekly-report'), sheetCsv(cfg.newsSheetCsvUrl)]);
  const out = buildContent({ issues, csv, owner: repo.split('/')[0], newsFormUrl: cfg.newsFormUrl || '', archive, posts });

  const strip = o => JSON.stringify({ ...o, generatedAt: null });
  if (prev && strip(prev) === strip(out)) {
    console.log('No changes in content; leaving site/data/content.json as is.');
  } else {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, JSON.stringify(out));
    console.log(`Wrote site/data/content.json: ${out.reports.length} reports (${archive.length} archived), ${out.news.length} news stories`);
  }
} catch (e) {
  // Content is optional: keep the last good file so the scoreboard still updates.
  console.error(`Content not refreshed: ${e.message}`);
  if (!prev) {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, JSON.stringify(buildContent({ newsFormUrl: cfg.newsFormUrl || '', archive, posts })));
  }
  process.exitCode = 0;
}
