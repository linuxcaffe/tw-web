// A context with quotes and `or` (like the live 'personal', which matched nothing until
// 2026-10-15) selects the tasks task itself would.
const { check, expect, B, sleep, cardTexts } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/');
    await pg.evaluate(() => window.twNav.setState({ context: 'either' }));
    await pg.goto(B + '/');
    await pg.waitForSelector('#tasks-container .card-desc-text, #tasks-container .no-tasks');
    await sleep(500);
    const got = (await cardTexts(pg)).sort();
    expect(JSON.stringify(got) === JSON.stringify(['alpha work task', 'beta home due']),
           `context "either" shows ${JSON.stringify(got)}`);
});
