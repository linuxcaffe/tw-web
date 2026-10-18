// Calendar scope: the events follow only the status buttons; the Unscheduled list is pending,
// in the context, through the nav filter. (Reverses bug 5's "context everywhere" for the events.)
const { check, expect, task, B, sleep, cardTexts } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/');
    await pg.evaluate(() => window.twNav.setState({ context: 'work' }));
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('#calendar .fc-timegrid-body');
    await sleep(1500);
    const evs = await pg.$$eval('.fc-ev-title', els => els.map(e => e.textContent));
    for (const d of ['beta home due', 'gamma home sched', 'omega home due'])
        expect(evs.some(t => t.includes(d)), `context work hides the event "${d}": ${JSON.stringify(evs)}`);
    const side = await cardTexts(pg, '#unplanned-tasks');
    expect(side.some(t => t.includes('alpha')) && !side.some(t => t.includes('delta')),
           `Unscheduled list ignores context work: ${JSON.stringify(side)}`);

    // Completed: a completed scheduled task becomes an event; the list stays pending
    task('3', 'done');
    task('1', 'done');
    await pg.evaluate(() => { TW.store.invalidate(); window.twNav.setState({ statuses: ['completed'] }); });
    await sleep(1500);
    const done = await pg.$$eval('.fc-ev-title', els => els.map(e => e.textContent));
    expect(done.some(t => t.includes('gamma')) && !done.some(t => t.includes('beta')),
           `Completed shows the wrong events: ${JSON.stringify(done)}`);
    const side2 = await cardTexts(pg, '#unplanned-tasks');
    expect(side2.some(t => t.includes('zeta')) && !side2.some(t => t.includes('alpha')),
           `Unscheduled list isn't pending-only under Completed: ${JSON.stringify(side2)}`);
});
