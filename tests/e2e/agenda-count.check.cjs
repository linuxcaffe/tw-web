// The Agenda's counter is the dated tasks shown / every task of the chosen statuses, as on the List,
// Calendar and Kanban (user 2026-11-23: "starts ok but degrades on filtering"): under a context its
// total was the context's, cached, so it shrank.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    const count = async () => { await sleep(1000); return pg.$eval('#tw-count', e => e.textContent); };
    await pg.goto(B + '/agenda.html');
    await pg.waitForSelector('#tasks-container .task-card');
    let c = await count();
    expect(c === '4/7', `fresh: ${c}, want 4/7 (4 dated of 7 pending)`);
    await pg.evaluate(() => window.twNav.setState({ filter: 'home' }, { clientOnly: true }));
    c = await count();
    expect(c === '3/7', `filter home: ${c}, want 3/7`);
    await pg.evaluate(() => window.twNav.setState({ filter: '' }, { clientOnly: true }));
    await pg.evaluate(() => window.twNav.setState({ context: 'work' }));
    c = await count();
    expect(c === '1/7', `context work: ${c}, want 1/7`);
    await pg.evaluate(() => sessionStorage.clear());
    await pg.reload();
    c = await count();
    expect(c === '1/7', `context work, nothing cached: ${c}, want 1/7`);
    await pg.evaluate(() => window.twNav.setState({ context: '' }));
});
