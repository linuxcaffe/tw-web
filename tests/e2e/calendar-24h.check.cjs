// Week and Day draw all 24 hours. The grid used to run from cal_day_start to cal_day_end, so a
// task at 01:00 (e.g. a midnight that drifted across a DST change) was loaded but never shown.
// The day range now only shades the hours outside it.
const { check, expect, task, B, sleep } = require('./lib.cjs');
check(async pg => {
    task('add', 'early probe', 'due:today+1h');
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    task('add', 'late probe', `scheduled:${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:30`);
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-ev-title');
    await sleep(500);
    const r = await pg.evaluate(() => {
        const shown = t => [...document.querySelectorAll('.fc-timegrid-event .fc-ev-title')]
            .some(e => e.textContent.includes(t) && e.getBoundingClientRect().height > 0);
        const slots = [...document.querySelectorAll('.fc-timegrid-slot-lane')].map(e => e.dataset.time);
        return { early: shown('early probe'), late: shown('late probe'),
                 first: slots[0], last: slots[slots.length - 1],
                 shade: document.querySelectorAll('.fc-timegrid-col .fc-non-business').length };
    });
    expect(r.early, 'a 01:00 event is not drawn');
    expect(r.late,  'a 23:30 event is not drawn');
    expect(r.first === '00:00:00', `the grid starts at ${r.first}`);
    expect(r.shade >= 7, `${r.shade} shaded blocks (each day should shade outside the day range)`);
});
