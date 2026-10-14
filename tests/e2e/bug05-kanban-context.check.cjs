// Bug 5: with a context set, Kanban's Unassigned column follows it like the state columns do.
const { check, expect, B, cardTexts } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/');
    await pg.evaluate(() => window.twNav.setState({ context: 'work' }));
    await pg.goto(B + '/kanban.html');
    await pg.waitForSelector('.kb-col[data-col="todo"] .card-desc-text');
    const todo = await cardTexts(pg, '.kb-col[data-col="todo"]');
    if (todo.includes('delta home kanban')) throw new Error('state columns ignore context too; check the seed');
    const una = await cardTexts(pg, '.kb-col[data-col=""]');
    const home = una.filter(t => t.includes('home'));
    expect(home.length === 0, `Unassigned shows project:home tasks under context work: ${JSON.stringify(home)}`);
});
