// Kanban, Agenda and Calendar load their seeded tasks.
const { check, expect, B, cardTexts } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/kanban.html');
    await pg.waitForSelector('.kb-col[data-col="todo"] .card-desc-text');
    const todo = (await cardTexts(pg, '.kb-col[data-col="todo"]')).sort();
    expect(JSON.stringify(todo) === JSON.stringify(['delta home kanban', 'zeta work kanban']),
           `Kanban todo column: ${JSON.stringify(todo)}`);

    await pg.goto(B + '/agenda.html');
    await pg.waitForSelector('.agenda-date-header');
    const agenda = (await cardTexts(pg)).sort();
    for (const t of ['beta home due', 'gamma home sched', 'omega home due'])
        expect(agenda.includes(t), `Agenda lacks "${t}": ${JSON.stringify(agenda)}`);

    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-ev-title');
    const evs = await pg.$$eval('.fc-ev-title', els => els.map(e => e.textContent));
    expect(evs.includes('gamma home sched'), `Calendar events: ${JSON.stringify(evs)}`);
});
