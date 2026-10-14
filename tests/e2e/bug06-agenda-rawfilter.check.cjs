// Bug 6: a raw filter shown as active on Agenda must also be applied there.
const { check, expect, B, sleep, cardTexts } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/');
    await pg.evaluate(() => window.twNav.setRawFilter('project:work'));
    await pg.goto(B + '/agenda.html');
    await sleep(1500);
    const bar = await pg.textContent('#tw-filter-bar');
    if (!bar.includes('project:work')) throw new Error('raw filter not shown; check the setup');
    const home = (await cardTexts(pg)).filter(t => t.includes('home'));
    expect(home.length === 0, `Agenda shows project:home tasks under raw filter project:work: ${JSON.stringify(home)}`);
});
