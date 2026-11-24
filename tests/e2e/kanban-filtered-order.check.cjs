// Reordering a lane under a nav filter keeps the hidden cards' places (2026-11-23: the filter
// narrows every lane now, and a drag saved only the visible cards, so the rest lost their order).
const { check, expect, task, exportOne, B, sleep } = require('./lib.cjs');
check(async pg => {
    task('add', 'theta home kanban', 'project:home', 'state:todo');
    const u = d => exportOne(`description:"${d}"`).uuid;
    const [delta, zeta, theta] = ['delta home kanban', 'zeta work kanban', 'theta home kanban'].map(u);

    await pg.goto(B + '/kanban.html');
    await pg.evaluate(o => fetch('api/kanban/order', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ col: 'todo', order: o }) }), [delta, zeta, theta]);
    await pg.evaluate(() => window.twNav.setState({ project: 'home' }));
    await pg.reload();
    await pg.waitForSelector('.kb-col[data-col="todo"] .card-desc-text', { state: 'attached' });

    // the drag's result: the two visible home cards swapped
    await pg.evaluate(([a, b]) => _kbReordered('todo', [a, b]), [theta, delta]);
    await sleep(300);
    const saved = await pg.evaluate(() => fetch('api/kanban/order').then(r => r.json()).then(d => d.order.todo));
    await pg.evaluate(() => window.twNav.setState({ project: '' }));
    expect(JSON.stringify(saved) === JSON.stringify([theta, zeta, delta]),
        `saved order ${JSON.stringify(saved)}, want theta, zeta (hidden, kept in place), delta`);
});
