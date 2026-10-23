// The editor's recur line, against recurrence-overhaul's own hooks (withRecurrence): the hook
// decides, the editor fills, hints and reports.
//  - Add with a rule makes a template (and the hook its first instance), with type and end.
//  - Chain greys until and hints; a chain with until goes to the hook, whose refusal is shown.
//  - A template's wait shows as a date (anchor + rwait) and saves back as an offset.
//  - An instance hides the line for its template's rule; its edit shows the hook's note.
const { check, expect, task, B, sleep, withRecurrence } = require('./lib.cjs');

const all = () => JSON.parse(task('rc.hooks=off', 'export'));
const toast = pg => pg.locator('#tw-notif-text').textContent();
const open = (pg, t) => pg.evaluate(t => taskEditor.show(t), t || null);

check(async pg => withRecurrence(async () => {
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');

    // Add a template
    await open(pg);
    await pg.waitForSelector('#task-editor-r', { state: 'visible' });
    await pg.fill('#task-editor-description', 'recur e2e rent');
    await pg.fill('#task-editor-due', '2030-01-31T09:00');
    await pg.fill('#task-editor-r', '1mo');
    await pg.fill('#task-editor-rend', '2030-12-31');
    await pg.click('#task-editor-save');
    await sleep(2500);
    let tasks = all();
    const tpl = tasks.find(t => t.description === 'recur e2e rent' && t.status === 'recurring');
    expect(tpl, 'no template: ' + JSON.stringify(tasks.filter(t => t.description.includes('recur e2e'))));
    expect(tpl.r === '1mo' && tpl.type === 'period' && tpl.rend, 'template fields: ' + JSON.stringify(tpl));
    expect(tasks.some(t => t.rtemplate === tpl.uuid && t.status === 'pending'), 'the hook spawned no instance');

    // Chain: hints, then the hook's refusal of until
    await open(pg);
    await pg.waitForSelector('#task-editor-r', { state: 'visible' });
    await pg.fill('#task-editor-description', 'recur e2e gym');
    await pg.fill('#task-editor-r', '2d');
    await pg.click('.te-recur-type span:text-is("chain")');
    const hint1 = await pg.locator('#te-recur-note').textContent();
    expect(hint1.includes('due or scheduled'), 'no anchor hint: ' + hint1);
    expect(await pg.locator('#task-editor-until').evaluate(e => e.closest('.te-date-field').classList.contains('te-recur-unused')),
           'until not greyed for a chain');
    await pg.fill('#task-editor-due', '2030-01-31T09:00');
    await pg.fill('#task-editor-until', '2030-02-01T09:00');
    const hint2 = await pg.locator('#te-recur-note').textContent();
    expect(hint2.includes('no until'), 'no chain-until hint: ' + hint2);
    await pg.click('#task-editor-save');
    await sleep(2000);
    const refusal = await toast(pg);
    expect(refusal.includes('takes no until') && !refusal.includes('override'), 'hook refusal not shown: ' + refusal);
    expect(!all().some(t => t.description === 'recur e2e gym'), 'a chain with until was created');
    await pg.evaluate(() => taskEditor.hide());

    // A template's wait: shown as a date, saved as an offset
    task('rc.hooks=off', tpl.uuid, 'modify', 'rwait:due-604800s');
    await open(pg, tpl);
    await pg.waitForSelector('#task-editor-r', { state: 'visible' });
    await sleep(300);
    expect(await pg.inputValue('#task-editor-r') === '1mo', 'template rule not shown');
    const wait = await pg.inputValue('#task-editor-wait');
    expect(wait === '2030-01-24T09:00', 'template wait not anchor - 7d: ' + wait);
    await pg.fill('#task-editor-wait', '2030-01-29T09:00');
    await pg.click('#task-editor-save');
    await sleep(2500);
    const after = all().find(t => t.uuid === tpl.uuid);
    expect(after.rwait === 'due-172800s' && !after.wait, 'template wait not saved as an offset: ' + JSON.stringify(after));

    // An instance: the template's rule in place of the line; its edit shows the hook's note
    const inst = all().find(t => t.rtemplate === tpl.uuid && t.status === 'pending');
    await open(pg, inst);
    await pg.waitForSelector('#te-recur-note >> text=edit template');
    expect(!(await pg.locator('#te-recur-row').isVisible()), 'recur line shown on an instance');
    const note = await pg.locator('#te-recur-note').textContent();
    expect(note.includes('instance #1') && note.includes('1mo'), 'instance note: ' + note);
    await pg.fill('#task-editor-priority', 'H');
    await pg.click('#task-editor-save');
    await sleep(2500);
    const msg = await toast(pg);
    expect(msg.includes('To apply to template'), "the hook's note not shown: " + msg);
    expect(all().find(t => t.uuid === tpl.uuid).priority === undefined, 'the instance edit changed the template');
}));
