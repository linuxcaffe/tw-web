// The deps field on an edit (djp 2026-11-24 review):
//  - the field's list is the whole list: removing an ID removes that dependency (2.6.2's
//    depends:X only ever added, so a removal did nothing)
//  - -ID on an edit makes task ID wait for this one, as it does when adding (it was dropped)
//  - -ID of this task itself is refused, and nothing changes
const { check, expect, B, sleep, task, exportOne } = require('./lib.cjs');

const toast = pg => pg.locator('#tw-notif-text').textContent();

async function edit(pg, uuid, deps) {
    await pg.evaluate(u => taskEditor.show({ uuid: u }), uuid);
    await pg.waitForFunction(() => document.activeElement?.id === 'task-editor-description');
    await pg.fill('#task-editor-deps', deps);
    await pg.click('#task-editor-save');
    await sleep(1500);
}

check(async pg => {
    for (const d of ['deps e2e a', 'deps e2e b', 'deps e2e goal', 'deps e2e step'])
        task('add', '--', d);
    const t = d => exportOne(`description:'${d}'`);
    const [a, b, goal, step] = ['deps e2e a', 'deps e2e b', 'deps e2e goal', 'deps e2e step'].map(t);
    task(step.uuid, 'modify', `depends:${a.id},${b.id}`);

    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');

    // Remove b, and make goal wait for step
    await edit(pg, step.uuid, `${a.id}, -${goal.id}`);
    const s1 = exportOne(step.uuid), g1 = exportOne(goal.uuid);
    expect(JSON.stringify(s1.depends) === JSON.stringify([a.uuid]),
           `step should depend on a only: ${JSON.stringify(s1.depends)}`);
    expect((g1.depends || []).includes(step.uuid), `goal doesn't wait for step: ${JSON.stringify(g1.depends)}`);

    // Clear the list
    await edit(pg, step.uuid, '');
    expect(!exportOne(step.uuid).depends, 'the emptied field left deps');

    // Itself: refused, nothing written
    await edit(pg, step.uuid, `${a.id}, -${step.id}`);
    const msg = await toast(pg);
    expect(msg.includes("can't wait for itself"), 'no refusal: ' + msg);
    expect(!exportOne(step.uuid).depends, 'a refused save still wrote deps');
});
