// /embed-edit (tw-nb-interop): the Add page in Edit mode. Opens the task named by ?uuid=
// filled in, saves through tw-web's own modify, and reports tw-task-saved {uuid}. A bad or
// unknown uuid says so instead of opening an empty Add form. Also: a pre-filled project on
// /embed-add can be changed (djp's report, 2026-11-01).
const { check, expect, task, B, sleep, exportOne } = require('./lib.cjs');
check(async pg => {
    task('add', 'project:kitchen', 'priority:H', '--', 'embed edit theta');
    const t = exportOne('/embed edit theta/');

    await pg.goto(B + '/embed-edit?uuid=' + t.uuid);
    await pg.waitForFunction(() => window.twEmbedLast?.type === 'tw-add-ready');
    expect(await pg.inputValue('#task-editor-description') === 'embed edit theta', 'description filled in');
    expect(await pg.inputValue('#task-editor-project') === 'kitchen', 'project filled in');
    await pg.fill('#task-editor-project', 'garden');
    await pg.click('#task-editor-save');
    await pg.waitForFunction(() => window.twEmbedLast && window.twEmbedLast.type !== 'tw-add-ready');
    const msg = await pg.evaluate(() => window.twEmbedLast);
    expect(msg.type === 'tw-task-saved' && msg.uuid === t.uuid, `saved reported, got ${JSON.stringify(msg)}`);
    expect(exportOne('/embed edit theta/').project === 'garden', 'the edit is saved');

    for (const bad of ['', 'not-a-uuid', '0badc0de-0000-4000-8000-000000000000']) {
        await pg.goto(B + '/embed-edit?uuid=' + bad);
        await pg.waitForFunction(() => window.twEmbedLast?.type === 'tw-edit-failed', null, { timeout: 5000 });
        expect(await pg.isVisible('#embed-error'), `unknown task "${bad}" says so`);
    }

    // a pre-filled project on Add can be overridden
    await pg.goto(B + '/embed-add?project=kitchen');
    await pg.waitForSelector('#task-editor-description', { state: 'visible' });
    await pg.fill('#task-editor-description', 'embed add iota');
    await pg.fill('#task-editor-project', 'garden');
    await pg.click('#task-editor-save');
    await pg.waitForFunction(() => window.twEmbedLast?.type === 'tw-task-added');
    expect(exportOne('/embed add iota/').project === 'garden', 'the typed project wins over the pre-fill');
});
