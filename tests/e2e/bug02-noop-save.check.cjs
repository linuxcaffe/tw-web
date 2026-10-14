// Bug 2: opening a task in the editor and saving without changes must not modify it.
const { check, expect, B, sleep, exportOne } = require('./lib.cjs');
check(async pg => {
    const before = exportOne('/epsilon/');
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    await sleep(1100);   // so a rewrite would get a new `modified` second
    await pg.locator('.task-card', { hasText: 'epsilon work secs' }).locator('.ca-edit').click();
    await pg.waitForSelector('#task-editor-save', { state: 'visible' });
    await sleep(300);
    await pg.click('#task-editor-save');
    await sleep(1500);
    const after = exportOne('/epsilon/');
    expect(after.due === before.due, `due changed: ${before.due} → ${after.due}`);
    expect(after.modified === before.modified, `modified changed: ${before.modified} → ${after.modified}`);
});
