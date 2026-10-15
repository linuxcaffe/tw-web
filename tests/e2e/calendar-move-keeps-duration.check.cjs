// Moving an event writes only its new start. The block's default length (60 min scheduled,
// 30 min due) is for display; a move used to write it to the task as sched_duration/due_duration.
const { check, expect, exportOne, B, sleep } = require('./lib.cjs');
check(async pg => {
    const before = exportOne('description:gamma');
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-ev-title');
    const box = await pg.locator('.fc-timegrid-event', { hasText: 'gamma home sched' }).boundingBox();
    await pg.mouse.move(box.x + box.width / 2, box.y + 5);
    await pg.mouse.down();
    await pg.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 10 });
    await pg.mouse.up();
    await sleep(1500);
    const after = exportOne('description:gamma');
    expect(after.scheduled !== before.scheduled, `scheduled unchanged (${after.scheduled})`);
    expect(!('sched_duration' in after), `a move wrote sched_duration:${after.sched_duration}`);
});
