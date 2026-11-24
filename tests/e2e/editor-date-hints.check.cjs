// The editor warns, never blocks, on dates in an illogical order (tw:docs/tw-web-edate-plan.md,
// step 5): scheduled after due, wait after until. 2.6.2 accepts both; the Agenda and Calendar then
// take the earlier date. The warning updates as you type and shows on opening such a task.
const { check, expect, B, sleep, task } = require('./lib.cjs');
const note = pg => pg.evaluate(() => { const n = document.querySelector('#te-date-note');
    return n && getComputedStyle(n).display !== 'none' ? n.textContent : ''; });
const set = (pg, id, v) => pg.evaluate(([id, v]) => { const el = document.getElementById(id); el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
check(async pg => {
    task('add', 'scheduled:2030-06-10T09:00', 'due:2030-06-05T09:00', '--', 'h-late-sched');
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');

    await pg.evaluate(() => document.dispatchEvent(new CustomEvent('tw-open-add')));
    await pg.waitForSelector('#task-editor-save', { state: 'visible' });
    await sleep(300);
    expect(await note(pg) === '', `a hint on an empty form: ${await note(pg)}`);
    await set(pg, 'task-editor-due', '2030-06-05T09:00');
    await set(pg, 'task-editor-scheduled', '2030-06-10T09:00');
    expect(/scheduled.*after.*due/i.test(await note(pg)), `no scheduled-after-due hint: "${await note(pg)}"`);
    await set(pg, 'task-editor-scheduled', '2030-06-01T09:00');
    expect(await note(pg) === '', `hint stayed after fixing: ${await note(pg)}`);
    await set(pg, 'task-editor-until', '2030-07-01T09:00');
    await set(pg, 'task-editor-wait', '2030-07-05T09:00');
    expect(/wait.*after.*until/i.test(await note(pg)), `no wait-after-until hint: "${await note(pg)}"`);
    await pg.click('#task-editor-cancel');
    await sleep(300);

    // An existing task in the wrong order says so when opened
    const card = pg.locator('.task-card', { hasText: 'h-late-sched' });
    await card.locator('[data-task-action="edit"]').click();
    await pg.waitForSelector('#task-editor-save', { state: 'visible' });
    await sleep(800);
    expect(/scheduled.*after.*due/i.test(await note(pg)), `no hint on opening: "${await note(pg)}"`);
});
