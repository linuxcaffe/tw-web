// Bug 5: with a context set, Calendar events follow it like the sidebar does.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/');
    await pg.evaluate(() => window.twNav.setState({ context: 'work' }));
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('#calendar .fc-timegrid-body');
    await sleep(1500);
    const evs = await pg.$$eval('.fc-ev-title', els => els.map(e => e.textContent));
    const home = evs.filter(t => t.includes('home'));
    expect(home.length === 0, `Calendar shows project:home events under context work: ${JSON.stringify(home)}`);
});
