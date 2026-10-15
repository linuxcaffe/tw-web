// Clicking a day in Month opens the new-task editor with that date and no duration. The
// selection spans the whole day, which pre-filled sched_duration with PT24H.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-ev-title');
    await pg.click('.view-btn[data-view="month"]');
    await pg.waitForSelector('.fc-daygrid-day.fc-day-today');
    await pg.click('.fc-daygrid-day.fc-day-today .fc-daygrid-day-bottom', { force: true });
    await pg.waitForSelector('#task-editor-scheduled');
    await sleep(300);
    const v = await pg.evaluate(() => ({
        sched: document.querySelector('#task-editor-scheduled').value,
        dur:   document.querySelector('#task-editor-sched-duration')?.value || '',
    }));
    expect(/T00:00$/.test(v.sched), `scheduled prefilled as ${v.sched}`);
    expect(v.dur === '', `sched_duration prefilled as ${v.dur}`);
});
