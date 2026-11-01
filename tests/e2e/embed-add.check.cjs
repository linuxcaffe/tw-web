// /embed-add (tw-nb-interop M6): tw-web's own Add dialog, opened in Add mode and pre-filled
// from the query, adds the task through /api/task/add and reports its uuid (to nb-web, by
// postMessage; kept on window.twEmbedLast for checks). Closing reports tw-add-closed.
const { check, expect, B, sleep, exportOne } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/embed-add?project=kitchen&tags=reno');
    await pg.waitForSelector('#task-editor-description', { state: 'visible' });
    expect(await pg.inputValue('#task-editor-project') === 'kitchen', 'project pre-filled');
    expect(await pg.inputValue('#task-editor-tags') === 'reno', 'tags pre-filled');
    expect(await pg.evaluate(() => document.activeElement.id) === 'task-editor-description',
           'description has focus');
    expect((await pg.evaluate(() => window.twEmbedLast))?.type === 'tw-add-ready', 'ready reported');

    await pg.fill('#task-editor-description', 'embed add zeta');
    await pg.click('#task-editor-save');
    await pg.waitForFunction(() => window.twEmbedLast && window.twEmbedLast.type !== 'tw-add-ready');
    const msg = await pg.evaluate(() => window.twEmbedLast);
    expect(msg.type === 'tw-task-added', `added reported, got ${JSON.stringify(msg)}`);
    const t = exportOne('/embed add zeta/');
    expect(t && msg.uuid === t.uuid, `uuid ${msg.uuid} is the new task's`);
    expect(t.project === 'kitchen' && (t.tags || []).includes('reno'), 'project and tags saved');

    // Log: a task added already completed gets its note too, so it reports its uuid
    await pg.goto(B + '/embed-add');
    await pg.waitForSelector('#task-editor-description', { state: 'visible' });
    await pg.fill('#task-editor-description', 'embed log eta');
    await pg.click('#task-editor-log');
    await pg.waitForFunction(() => window.twEmbedLast && window.twEmbedLast.type !== 'tw-add-ready');
    const logged = await pg.evaluate(() => window.twEmbedLast);
    const lt = exportOne('/embed log eta/');
    expect(logged.type === 'tw-task-added' && logged.logged === true, `logged reported, got ${JSON.stringify(logged)}`);
    expect(lt && lt.status === 'completed' && logged.uuid === lt.uuid, 'uuid is the logged task\'s');

    await pg.goto(B + '/embed-add');
    await pg.waitForSelector('#task-editor-description', { state: 'visible' });
    await pg.click('.task-editor-close');
    await sleep(200);
    expect((await pg.evaluate(() => window.twEmbedLast))?.type === 'tw-add-closed', 'close reported');
});
