// A date with no time is stored as local midnight. Week and Day start at cal_day_start (06:00),
// so midnight tasks were loaded but never shown; they now sit in the all-day strip. Durations
// in days (P2D) size an event too (only PT… was read).
const { check, expect, task, B, sleep } = require('./lib.cjs');
async function allDayTitles(pg) {
    return pg.$$eval('.fc-daygrid-event .fc-ev-title', els => els.map(e => e.textContent));
}
check(async pg => {
    task('add', 'midnight due probe', 'due:today');
    task('add', 'midnight sched probe', 'scheduled:today');
    task('add', 'twoday probe', 'due:today+9h', 'due_duration:P2D');
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-ev-title');
    await sleep(300);
    let t = await allDayTitles(pg);
    expect(t.some(x => x.includes('midnight due')) && t.some(x => x.includes('midnight sched')),
           `week view all-day strip shows ${JSON.stringify(t)}`);
    await pg.click('.view-btn[data-view="day"]');
    await sleep(300);
    t = await allDayTitles(pg);
    expect(t.some(x => x.includes('midnight sched')), `day view all-day strip shows ${JSON.stringify(t)}`);
    const hours = await pg.evaluate(() => {
        const e = calendar.getEvents().find(e => e.title.includes('twoday'));
        return e && (e.end - e.start) / 3600000;
    });
    expect(hours === 48, `a P2D due event is ${hours} h long`);
});
