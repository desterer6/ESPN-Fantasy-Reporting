// League content (weekly reports + news) -> site data. Pure functions only; tests/content.test.mjs covers them.
//
// Who can publish what:
//   Weekly reports: GitHub issues labeled "weekly-report" whose author is the repository OWNER.
//                   Anyone can open an issue, but only the owner's are published.
//   News stories:   members submit a Google Form (no account needed). Responses land in the owner's
//                   Google Sheet; only rows the owner ticks "Approved" are published (see README).
// Everything is stored as plain text. The site escapes it before display; nothing is trusted as HTML.

export const LIMITS = { headline: 120, story: 1200, byline: 60, report: 20000, title: 140 };

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
export function clean(s, max) {
  const v = String(s ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, '').trim();
  return v.length > max ? v.slice(0, max - 1).trimEnd() + '…' : v;
}

// Issue forms render as "### Field label\n\nvalue" blocks. "_No response_" means an empty optional field.
export function parseIssueForm(body) {
  const out = {};
  const parts = String(body || '').split(/^###\s+/m).slice(1);
  for (const p of parts) {
    const nl = p.indexOf('\n');
    const key = (nl < 0 ? p : p.slice(0, nl)).trim().toLowerCase();
    const val = (nl < 0 ? '' : p.slice(nl + 1)).trim();
    out[key] = val === '_No response_' ? '' : val;
  }
  return out;
}

const labelsOf = issue => (issue.labels || []).map(l => (typeof l === 'string' ? l : l.name || '').toLowerCase());
const isOwner = (issue, owner) =>
  issue.author_association === 'OWNER' || (owner && issue.user?.login?.toLowerCase() === owner.toLowerCase());

export function reportsFromIssues(issues, { owner } = {}) {
  return issues
    .filter(i => !i.pull_request && i.state !== 'deleted' && labelsOf(i).includes('weekly-report') && isOwner(i, owner))
    .filter(i => !labelsOf(i).includes('hidden'))
    .map(i => {
      const f = parseIssueForm(i.body);
      const week = parseInt(f.week, 10);
      const season = parseInt(f.season, 10);
      return {
        id: `r${i.number}`,
        week: Number.isFinite(week) ? week : null,
        season: Number.isFinite(season) ? String(season) : null,
        title: clean(f.headline || i.title.replace(/^\[report\]\s*/i, ''), LIMITS.title),
        body: clean(f.report ?? i.body, LIMITS.report),
        date: i.created_at,
      };
    })
    .filter(r => r.body)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// Archived reports committed to the repo (reports/archive/*.md): the owner's own past reports, kept
// word for word. Each file starts with "key: value" lines (week, season, title, date), then a line
// with "---", then the Markdown body. Only the repo owner can commit, so these are trusted like owner issues.
export function reportsFromArchive(files = []) {
  return files.map(({ name, text }) => {
    const src = String(text || '').replace(/\r\n?/g, '\n');
    const cut = src.indexOf('\n---\n');
    if (cut < 0) return null;
    const meta = {};
    for (const line of src.slice(0, cut).split('\n')) {
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (m) meta[m[1].toLowerCase()] = m[2].trim();
    }
    const week = parseInt(meta.week, 10);
    const season = parseInt(meta.season, 10);
    const date = new Date(meta.date);
    const slug = String(name || '').replace(/\.md$/i, '').replace(/[^a-z0-9-]/gi, '').toLowerCase();
    return {
      id: `a-${slug}`,
      week: Number.isFinite(week) ? week : null,
      season: Number.isFinite(season) ? String(season) : null,
      title: clean(meta.title, LIMITS.title),
      body: clean(src.slice(cut + 5), LIMITS.report),
      date: isNaN(date) ? null : date.toISOString(),
      archived: true,
    };
  }).filter(r => r && r.title && r.body);
}

// Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, newlines inside quotes).
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

// Sheet columns are matched by header name, so column order does not matter.
// If an "Approved" column exists, only rows marked TRUE/yes/x are used; otherwise every row is
// treated as approved (for a tab that already filters to approved rows).
export function newsFromCsv(text) {
  const [head, ...rows] = parseCsv(text);
  if (!head) return [];
  const idx = name => head.findIndex(x => x.trim().toLowerCase().startsWith(name));
  const col = { ts: idx('timestamp'), headline: idx('headline'), story: idx('story'), byline: idx('byline'), approved: idx('approved') };
  if (col.headline < 0) return [];
  const yes = v => /^(true|yes|y|x|✓|approved)$/i.test(String(v || '').trim());
  return rows
    .filter(r => col.approved < 0 || yes(r[col.approved]))
    .map((r, i) => {
      const d = col.ts >= 0 ? new Date(r[col.ts]) : null;
      return {
        id: `s${i + 1}`,
        headline: clean(r[col.headline], LIMITS.headline),
        story: clean(col.story >= 0 ? r[col.story] : '', LIMITS.story),
        byline: clean(col.byline >= 0 ? r[col.byline] : '', LIMITS.byline),
        date: d && !isNaN(d) ? d.toISOString() : null,
      };
    })
    .filter(n => n.headline);
}

export function buildContent({ issues = [], csv = '', owner, newsFormUrl = '', archive = [], now = new Date() }) {
  const news = newsFromCsv(csv)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 100);
  return {
    generatedAt: now.toISOString(),
    newsFormUrl: /^https:\/\//.test(newsFormUrl) ? newsFormUrl : '',
    reports: [...reportsFromIssues(issues, { owner }), ...reportsFromArchive(archive)]
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    news,
  };
}
