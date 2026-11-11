// Writes site/data/league.json from the fictional test fixture, for local preview without ESPN.
// Run with: node scripts/demo.mjs   (don't commit the result; the scheduled workflow overwrites it)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLeagueData } from './espn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fx = f => fs.readFile(path.join(root, 'tests/fixtures', f), 'utf8').then(JSON.parse);
const out = buildLeagueData({ league: await fx('espn-league.json'), boxByPeriod: await fx('espn-box.json'), leagueId: 'demo' });
await fs.mkdir(path.join(root, 'site/data'), { recursive: true });
await fs.writeFile(path.join(root, 'site/data/league.json'), JSON.stringify(out));
console.log('Wrote demo data to site/data/league.json');
