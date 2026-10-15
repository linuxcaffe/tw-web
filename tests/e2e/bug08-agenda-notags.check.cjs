// Bug 8: Agenda filters with the List's rules. A "No tags" pick (.none:) keeps the untagged tasks.
const { check, expect, B, sleep, task, cardTexts } = require('./lib.cjs');
check(async pg => {
    task('2', 'modify', '+tagged');                 // beta tagged, omega not
    await pg.goto(B + '/agenda.html');
    await pg.waitForSelector('.card-desc-text');
    await pg.evaluate(() => window.twNav.setState({ tags: '.none:' }, { clientOnly: true }));
    await sleep(1000);
    const shown = await cardTexts(pg);
    expect(shown.some(t => t.includes('omega home due')), `untagged task hidden by "No tags": ${JSON.stringify(shown)}`);
    expect(!shown.some(t => t.includes('beta home due')), `tagged task shown under "No tags": ${JSON.stringify(shown)}`);
});
