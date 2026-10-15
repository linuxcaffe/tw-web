// The Kanban editor's annotation box is CodeMirror, as on the other views (kanban.html loads
// codemirror-bundle.js like they do).
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/kanban.html');
    await pg.waitForSelector('.kb-col[data-col="todo"] .card-desc-text');
    await pg.locator('.kb-col[data-col="todo"] .task-card', { hasText: 'delta home kanban' })
        .locator('.ca-edit').click({ force: true });
    await pg.waitForSelector('#task-editor-save', { state: 'visible' });
    await pg.click('#te-ann-add-btn');
    await sleep(300);
    expect(await pg.$('#te-ann-cm-host .cm-editor') !== null, 'annotation box is a plain textarea on Kanban');
});
