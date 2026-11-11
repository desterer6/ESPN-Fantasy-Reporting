// Tests for weekly reports, news and the safe Markdown renderer. No network: node tests/content.test.mjs
import { buildContent, parseCsv, parseIssueForm, clean, LIMITS } from '../scripts/content.mjs';
import { renderMarkdown, excerpt } from '../site/js/markdown.js';
import * as fx from './fixtures/content-fixture.mjs';
import { stampHtml, stampJs } from '../scripts/stamp.mjs';

let failed = 0, passed = 0;
const ok = (cond, msg) => { cond ? passed++ : (failed++, console.error('FAIL:', msg)); };

const c = buildContent({ issues: fx.issues, csv: fx.csv, owner: 'desterer6', newsFormUrl: 'https://forms.gle/abc' });

// Weekly reports: owner only, hidden skipped.
ok(c.reports.length === 1, `only the owner's visible report is published (got ${c.reports.length})`);
ok(c.reports[0].week === 9 && c.reports[0].season === '2026', 'report week and season parsed');
ok(c.reports[0].title === 'Chaos at the top as the leader stumbles', 'report headline from form');
ok(!JSON.stringify(c).includes('Should never be published'), 'non-owner report excluded');
ok(!JSON.stringify(c).includes('someone-else') && !JSON.stringify(c).includes('desterer6'), 'no GitHub logins in site data');

// News: approved rows only, quotes and newlines survive, newest first.
ok(c.news.length === 2, `two approved stories (got ${c.news.length})`);
ok(c.news[0].headline === 'Blockbuster trade shakes up the league', 'newest first');
ok(c.news[1].headline === 'Waiver wire madness, "again"', 'escaped quotes in CSV');
ok(c.news[0].story.includes('\n\nGrades'), 'multi-line story kept');
ok(c.news[0].byline === 'Gridiron Gossip', 'optional byline column matched by prefix');
ok(!JSON.stringify(c).includes('Unapproved rumor'), 'unapproved story excluded');
ok(buildContent({ newsFormUrl: 'javascript:alert(1)' }).newsFormUrl === '', 'form link must be https');

// CSV and form parsing edge cases.
ok(JSON.stringify(parseCsv('a,b\r\n"x\ny",2\r\n')) === JSON.stringify([['a', 'b'], ['x\ny', '2']]), 'CSV CRLF and quoted newline');
ok(parseIssueForm('### Byline\n\n_No response_\n\n### Story\n\nHi').byline === '', 'empty optional form field');
ok(clean('a'.repeat(500), LIMITS.headline).length === LIMITS.headline, 'length limit');
ok(clean('x\u0007y', 10) === 'xy', 'control characters removed');

// Markdown: formatting works, HTML never passes through.
const html = renderMarkdown(c.reports[0].body);
ok(html.includes('<h3>The big picture</h3>'), 'heading');
ok(html.includes('<strong>Three</strong>') && html.includes('<em>near</em>'), 'bold and italic');
ok(html.includes('<ul><li>'), 'list');
ok(html.includes('<blockquote>'), 'quote');
ok(html.includes('href="https://example.com/scores"') && html.includes('rel="noopener noreferrer nofollow"'), 'safe link');
ok(!html.includes('<script>') && html.includes('&lt;script&gt;'), 'script tag escaped');
ok(!renderMarkdown('[x](javascript:alert(1))').includes('href'), 'javascript: links not linked');
ok(!renderMarkdown('<img src=x onerror=alert(1)>').includes('<img'), 'raw HTML escaped');
ok(excerpt('## Head\n\n**Bold** text [link](https://a.b)', 50) === 'Bold text link', 'excerpt strips markup');

// Deploy cache-busting
ok(stampHtml('<link href="css/style.css"><script src="js/app.js"></script><a href="#/x">', 'abc') === '<link href="css/style.css?v=abc"><script src="js/app.js?v=abc"></script><a href="#/x">', 'stamp html assets only');
ok(stampJs("import * as A from './analytics.js';\nimport { h } from '../ui.js';\nconst u = 'data/league.json';", 'abc') === "import * as A from './analytics.js?v=abc';\nimport { h } from '../ui.js?v=abc';\nconst u = 'data/league.json';", 'stamp module imports only');

console.log(`${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
