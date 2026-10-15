// Bug 10: the Calendar's Unschedule button must not show for a due (⚑) event, and still shows
// for a scheduled one.
const { check, expect, B, sleep } = require('./lib.cjs');
async function unschedShown(pg, title) {
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-ev-title');
    await pg.locator('.fc-ev-title', { hasText: title }).click();
    await pg.waitForSelector('#task-detail-modal.show');
    await sleep(200);
    return pg.isVisible('#modal-unschedule-btn');
}
check(async pg => {
    expect(!(await unschedShown(pg, 'omega home due')), 'Unschedule shown on a due event');
    expect(await unschedShown(pg, 'gamma home sched'), 'Unschedule hidden on a scheduled event');
});
