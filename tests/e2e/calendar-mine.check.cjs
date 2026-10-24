// Your own events in the Calendar (tw-events' mine.rc: my-events.txt and the ghosts of tasks): an
// all-day one is a green bar in the all-day row; a timed one is a solid mark at its time in Week and
// Day with 📌 (hover: name and time) and a chip in Month. Never editable; Settings turns them off.
const { check, expect, B, sleep, withHolidays } = require('./lib.cjs');
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
check(async pg => withHolidays([
    ['Dentist', 0, undefined, { kind: 'mine', time: '14:30' }],
    ['Cottage', 0, undefined, { kind: 'mine' }],
], async () => {
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.tw-sky-mine');
    await sleep(500);
    const marks = await pg.$$eval('#calendar .tw-sky-mine', els => els.map(m => {
        const f = m.closest('.fc-timegrid-col-frame').getBoundingClientRect(), r = m.getBoundingClientRect();
        return { date: m.closest('.fc-timegrid-col').dataset.date, frac: (r.top - f.top) / f.height,
                 icon: m.textContent, title: m.querySelector('.tw-sky-icon').title };
    }));
    expect(marks.length === 1 && marks[0].date === iso(0) && marks[0].icon === '📌'
           && marks[0].title === 'Dentist 14:30', `mark: ${JSON.stringify(marks)}`);
    expect(Math.abs(marks[0].frac - 14.5 / 24) < 0.01, `at ${(marks[0].frac * 24).toFixed(2)} h, want 14.5`);
    const bars = await pg.$$eval('.tw-layer-mine', els => els.map(e => [e.textContent.trim(),
        getComputedStyle(e).backgroundColor, e.classList.contains('fc-event-draggable')]));
    expect(bars.length === 1 && bars[0][0] === 'Cottage', `all-day row: ${JSON.stringify(bars)}`);
    expect(bars[0][1] !== 'rgba(0, 0, 0, 0)' && !bars[0][2], `bar style/draggable: ${JSON.stringify(bars)}`);

    await pg.evaluate(() => fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cal_mine: false }) }));
    await pg.reload();
    await pg.waitForSelector('.fc-timegrid');
    await sleep(800);
    expect(await pg.$$eval('.tw-sky-mine, .tw-layer-mine', e => e.length) === 0, 'shown with cal_mine off');
    await pg.evaluate(() => fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cal_mine: true }) }));
}));
