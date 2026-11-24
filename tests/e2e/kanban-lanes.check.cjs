// Kanban lanes (2026-11-23): the count is workflow-lane cards / every pending task, and follows the
// nav filter; the board opens on todo (a phone shows that lane); lanes sort by hand by default,
// Done by completion; started starts, done completes, out of done reopens; completed text is green.
const { check, expect, task, exportOne, B, sleep, cardTexts } = require('./lib.cjs');
check(async pg => {
    task('add', 'eta done kanban', 'project:home');
    task('eta done kanban', 'done');
    const count = () => pg.$eval('#tw-count', e => e.textContent.trim());

    await pg.setViewportSize({ width: 390, height: 800 });
    await pg.goto(B + '/kanban.html');
    await pg.waitForSelector('.kb-col[data-col="todo"] .card-desc-text');

    const focused = await pg.$eval('.kb-col--focused', e => e.dataset.col);
    expect(focused === 'todo', `a fresh board focuses ${JSON.stringify(focused)}, not todo`);
    const shown = await pg.$$eval('.kb-col:not(.kb-col--hidden)', els => els.map(e => e.dataset.col));
    expect(JSON.stringify(shown) === '["todo"]', `a phone shows lanes ${JSON.stringify(shown)}, not todo`);

    expect(await count() === '2/7', `count is ${await count()}, want 2/7 (todo's two of 7 pending)`);
    await pg.evaluate(() => window.twNav.setState({ filter: 'delta' }, { clientOnly: true }));
    await sleep(300);
    expect(await count() === '1/7', `filtered count is ${await count()}, want 1/7`);
    const todo = await cardTexts(pg, '.kb-col[data-col="todo"]');
    expect(JSON.stringify(todo) === '["delta home kanban"]', `todo under filter delta: ${JSON.stringify(todo)}`);
    await pg.evaluate(() => window.twNav.setState({ filter: '' }, { clientOnly: true }));
    await sleep(300);

    const sorts = await pg.evaluate(() => [kbGetSort('todo'), kbGetSort(''), kbGetSort('done')]);
    expect(JSON.stringify(sorts) === '["manual","manual","end"]', `default sorts ${JSON.stringify(sorts)}`);

    const done = await cardTexts(pg, '.kb-col[data-col="done"]');
    expect(done.includes('eta done kanban'), `Done lane: ${JSON.stringify(done)}`);
    const colour = await pg.$eval('.kb-col[data-col="done"] .task-card.task-completed .card-desc-text',
        e => getComputedStyle(e).color);
    expect(colour === 'rgb(30, 132, 73)', `completed description colour ${colour}`);

    const delta = exportOne('description:"delta home kanban"').uuid;
    const move = to => pg.evaluate(([u, t]) => _kbMove(u, t).then(() => kbReload(true)), [delta, to]);

    await move('started');
    await pg.waitForSelector('.kb-col[data-col="started"] .task-card.task-started', { state: 'attached' });
    let t = exportOne(delta);
    expect(t.state === 'started' && t.start, `into started: state ${t.state}, start ${t.start}`);

    await move('review');
    t = exportOne(delta);
    expect(t.state === 'review' && !t.start, `out of started: state ${t.state}, start ${t.start}`);

    await move('done');
    await pg.waitForFunction(() => [...document.querySelectorAll('.kb-col[data-col="done"] .card-desc-text')]
        .some(e => e.textContent === 'delta home kanban'));
    expect(exportOne(delta).status === 'completed', 'into done did not complete');

    await move('todo');
    t = exportOne(delta);
    expect(t.status === 'pending' && t.state === 'todo' && !t.end, `out of done: ${t.status} ${t.state} ${t.end}`);
});
