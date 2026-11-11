// Fictional weekly-report issues and news-sheet CSV for tests and the local demo.
export const issues = [
  { number: 7, state: 'open', author_association: 'OWNER', user: { login: 'desterer6' }, created_at: '2026-11-10T15:00:00Z',
    labels: [{ name: 'weekly-report' }], title: '[Report] Week 9',
    body: '### Season\n\n2026\n\n### Week\n\n9\n\n### Headline\n\nChaos at the top as the leader stumbles\n\n### Report\n\n## The big picture\n\nWhat a week. **Three** upsets and a *near* record score.\n\n- Upset of the week: obvious\n- Waiver steal: also obvious\n\n> "We are so back." — someone, probably\n\nMore at [the scoreboard](https://example.com/scores).\n\n<script>alert(1)</script>' },
  { number: 8, state: 'open', author_association: 'NONE', user: { login: 'someone-else' }, created_at: '2026-11-10T16:00:00Z',
    labels: [{ name: 'weekly-report' }], title: '[Report] Fake', body: '### Week\n\n9\n\n### Headline\n\nNot the owner\n\n### Report\n\nShould never be published' },
  { number: 9, state: 'open', author_association: 'OWNER', user: { login: 'desterer6' }, created_at: '2026-11-03T15:00:00Z',
    labels: [{ name: 'weekly-report' }, { name: 'hidden' }], title: '[Report] Draft', body: '### Week\n\n8\n\n### Headline\n\nHidden draft\n\n### Report\n\nHidden' },
];
export const csv = [
  'Timestamp,Headline,Story,Byline (optional),Approved',
  '11/9/2026 20:15:00,"Blockbuster trade shakes up the league","Two contenders swapped stars.\n\nGrades to follow.",Gridiron Gossip,TRUE',
  '11/8/2026 10:00:00,"Unapproved rumor","This should not appear",,FALSE',
  '11/7/2026 09:00:00,"Waiver wire madness, ""again""","Everyone wanted the same backup RB.",,TRUE',
].join('\n');
