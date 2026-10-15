// Moving an all-day event to another day writes that day at local midnight (a date, no time)
// and no duration.
const { check, expect, task, exportOne, B, sleep } = require('./lib.cjs');
check(async pg => {
    task('add', 'midnight sched probe', 'scheduled:today');
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-ev-title');
    const ev  = await pg.locator('.fc-daygrid-event', { hasText: 'midnight sched' }).boundingBox();
    const col = await pg.locator('.fc-col-header-cell.fc-day-today').boundingBox();
    const dx  = col.x + col.width * 1.5 < (await pg.locator('#calendar').boundingBox()).x +
                (await pg.locator('#calendar').boundingBox()).width ? col.width : -col.width;
    await pg.mouse.move(ev.x + 10, ev.y + ev.height / 2);
    await pg.mouse.down();
    await pg.mouse.move(ev.x + 10 + dx, ev.y + ev.height / 2, { steps: 10 });
    await pg.mouse.up();
    await sleep(1500);
    const t = exportOne('description:midnight');
    const d = new Date(t.scheduled.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((d - today) / 86400000);
    expect(d.getHours() === 0 && d.getMinutes() === 0, `scheduled became ${d}`);
    expect(Math.abs(days) === 1, `moved ${days} days`);
    expect(!('sched_duration' in t), `wrote sched_duration:${t.sched_duration}`);
});
