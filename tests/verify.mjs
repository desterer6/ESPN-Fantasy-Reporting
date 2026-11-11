// Sanity checks for the published data. Runs before every deploy: node tests/verify.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { consistencyChecks, privacyChecks, historyChecks } from './checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'site/data/league.json'), 'utf8'));
let failed = 0, passed = 0;
const ok = (cond, msg) => { cond ? passed++ : (failed++, console.error('FAIL:', msg)); };

consistencyChecks(data, ok);
privacyChecks(data, ok);

// Content file (reports + news) must parse, and must not carry personal identifiers.
const contentPath = path.join(root, 'site/data/content.json');
if (fs.existsSync(contentPath)) {
  const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
  ok(Array.isArray(content.reports) && Array.isArray(content.news), 'content.json has reports and news');
  const text = JSON.stringify(content);
  for (const k of ['"user"', '"login"', '"email"', '"author_association"']) ok(!text.includes(k), `content.json must not contain ${k}`);
  ok(!content.newsFormUrl || content.newsFormUrl.startsWith('https://'), 'news form link is https');
}

// League history (past seasons from ESPN), if it has been pulled yet.
const historyPath = path.join(root, 'site/data/history.json');
if (fs.existsSync(historyPath)) historyChecks(JSON.parse(fs.readFileSync(historyPath, 'utf8')), ok);

console.log(`${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
