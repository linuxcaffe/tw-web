// Bug 10: the Calendar's Unschedule button must not show for a due (⚑) event.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-ev-title');
    await pg.locator('.fc-ev-title', { hasText: 'omega home due' }).click();
    await pg.waitForSelector('#task-detail-modal.show');
    await sleep(200);
    expect(!(await pg.isVisible('#modal-unschedule-btn')), 'Unschedule shown on a due event');
});
