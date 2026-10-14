// Bug 4: renaming a task in the Kanban editor must update the board.
const { check, expect, B, sleep, cardTexts, exportOne } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/kanban.html');
    await pg.waitForSelector('.kb-col[data-col="todo"] .card-desc-text');
    await pg.locator('.kb-col[data-col="todo"] .task-card', { hasText: 'delta home kanban' })
        .locator('.ca-edit').click({ force: true });
    await pg.waitForSelector('#task-editor-save', { state: 'visible' });
    await pg.fill('#task-editor-description', 'delta renamed');
    await pg.click('#task-editor-save');
    await sleep(1500);
    if (exportOne('4').description !== 'delta renamed') throw new Error('the save itself failed');
    const todo = await cardTexts(pg, '.kb-col[data-col="todo"]');
    expect(todo.includes('delta renamed'), `board still shows ${JSON.stringify(todo)}`);
});
