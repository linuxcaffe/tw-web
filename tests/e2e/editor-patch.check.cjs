// Bug 2, the other half: an edit changes exactly what the user changed, and keeps changes
// made elsewhere since the List was drawn (no lost update).
const { check, expect, B, sleep, task, exportOne } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    task('5', 'modify', 'priority:H', '+fromcli');   // after the List drew its cards
    await pg.locator('.task-card', { hasText: 'epsilon work secs' }).locator('.ca-edit').click();
    await pg.waitForSelector('#task-editor-save', { state: 'visible' });
    await sleep(300);
    await pg.fill('#task-editor-project', 'work.sub');
    const tags = await pg.inputValue('#task-editor-tags');
    await pg.fill('#task-editor-tags', tags ? tags + ', added' : 'added');
    await pg.click('#task-editor-save');
    await sleep(1500);
    const t = exportOne('5');
    expect(t.project === 'work.sub', `project not saved: ${t.project}`);
    expect((t.tags || []).includes('added'), `tag not added: ${JSON.stringify(t.tags)}`);
    expect(t.priority === 'H', `CLI priority lost: ${t.priority}`);
    expect((t.tags || []).includes('fromcli'), `CLI tag lost: ${JSON.stringify(t.tags)}`);
    expect(t.due === '20301201T170030Z', `due rewritten: ${t.due}`);
});
