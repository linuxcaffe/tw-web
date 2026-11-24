// The Recur line on a station without recurrence-overhaul (s5 runs a few hooks of its own): typing
// a rule warns that no template will be made there, and the save's notes say it again. With the
// hook (withRecurrence) there is no such warning. A hint, never a block (djp 2026-11-24).
const { check, expect, task, B, sleep, withRecurrence } = require('./lib.cjs');


// show() focuses the description 80 ms after the dialog opens (later on the first open, which loads
// the template): typing before that lands in the description ('recur e2e rent1mo')
const open = async pg => {
    await pg.evaluate(() => taskEditor.show(null));
    await pg.waitForFunction(() => document.activeElement?.id === 'task-editor-description');
};
const note = pg => pg.locator('#te-recur-note').textContent();

async function typeRule(pg) {
    await open(pg);
    await pg.waitForSelector('#task-editor-r', { state: 'visible' });
    await pg.fill('#task-editor-description', 'station e2e bill');
    await pg.fill('#task-editor-due', '2030-01-31T09:00');
    await pg.fill('#task-editor-r', '1mo');
    await sleep(300);
}

check(async pg => {
    // The UDAs but no hooks, as on s5
    await withRecurrence(async () => {
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    await typeRule(pg);
    await pg.waitForFunction(() => document.querySelector('#te-recur-note')?.textContent.includes('recurrence hook'),
                             null, { timeout: 3000 }).catch(() => {});
    const warn = await note(pg);
    expect(warn.includes("doesn't run the recurrence hook"), 'no station warning: ' + warn);
    await pg.fill('#task-editor-r', '');
    await sleep(200);
    expect(!(await pg.locator('#te-recur-note').isVisible()), 'warning stays without a rule');
    await pg.fill('#task-editor-r', '1mo');
    await pg.click('#task-editor-save');
    await sleep(2000);
    const saved = JSON.parse(task('rc.hooks=off', 'export')).find(t => t.description === 'station e2e bill');
    expect(saved && saved.r === '1mo', 'not saved (a hint, never a block): ' + JSON.stringify(saved));
    const notes = await pg.locator('body').textContent();
    expect(notes.includes("doesn't run the recurrence hook"), 'the save says nothing about it');
    }, { hooks: false });

    // With the hook: no warning
    await withRecurrence(async () => {
        await pg.goto(B + '/');
        await pg.waitForSelector('.card-desc-text');
        await typeRule(pg);
        const quiet = await note(pg);
        expect(!quiet.includes('recurrence hook'), 'warned on a station with the hook: ' + quiet);
        await pg.evaluate(() => taskEditor.hide());
    });
});
