// Sanity checks for the published data. Runs before every deploy: node tests/verify.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { consistencyChecks, privacyChecks } from './checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'site/data/league.json'), 'utf8'));
let failed = 0, passed = 0;
const ok = (cond, msg) => { cond ? passed++ : (failed++, console.error('FAIL:', msg)); };

consistencyChecks(data, ok);
privacyChecks(data, ok);

console.log(`${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
