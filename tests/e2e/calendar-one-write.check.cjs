// Moving an event sends one write. The page loaded the full FullCalendar bundle and then the
// daygrid, timegrid and interaction plugins again, so every interaction was registered twice
// and one drag sent two PUTs.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    const writes = [];
    pg.on('request', r => { if (r.method() !== 'GET') writes.push(r.url()); });
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-ev-title');
    const box = await pg.locator('.fc-timegrid-event', { hasText: 'gamma home sched' }).boundingBox();
    await pg.mouse.move(box.x + box.width / 2, box.y + 5);
    await pg.mouse.down();
    await pg.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 10 });
    await pg.mouse.up();
    await sleep(1500);
    expect(writes.length === 1, `one drag sent ${writes.length} writes`);
});
