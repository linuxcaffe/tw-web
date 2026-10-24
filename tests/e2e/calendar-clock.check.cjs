// Clock changes (tw-events' events.clock: sky.rc entries with .kind=clock and .at): drawn like the
// moon's phases, a dashed mark with 🕐 at the moment in Week and Day, and after the date on the
// Agenda's line for that day (never a line of their own). Settings → Moon & seasons → clock changes.
const { check, expect, B, sleep, withHolidays } = require('./lib.cjs');
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
check(async pg => withHolidays([
    ['Clocks back (EST)', 0, undefined, { kind: 'clock', time: '02:00' }],
], async () => {
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.tw-sky-clock');
    await sleep(500);
    const m = await pg.$$eval('#calendar .tw-sky-clock', els => els.map(e => {
        const f = e.closest('.fc-timegrid-col-frame').getBoundingClientRect(), r = e.getBoundingClientRect();
        return { date: e.closest('.fc-timegrid-col').dataset.date, frac: (r.top - f.top) / f.height,
                 icon: e.textContent, title: e.querySelector('.tw-sky-icon').title };
    }));
    expect(m.length === 1 && m[0].date === iso(0) && m[0].icon === '🕐' && m[0].title === 'Clocks back (EST) 02:00',
           `mark: ${JSON.stringify(m)}`);
    expect(Math.abs(m[0].frac - 2 / 24) < 0.01, `at ${(m[0].frac * 24).toFixed(2)} h, want 2`);

    await pg.goto(B + '/agenda.html');
    await pg.waitForSelector('.agenda-layer-clock');
    const head = await pg.$eval('.agenda-date-header.today', e => e.textContent);
    expect(head.endsWith(' · 🕐 Clocks back (EST) 02:00'), `today: ${head}`);

    await pg.evaluate(() => fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cal_clock: false }) }));
    await pg.reload();
    await pg.waitForSelector('.agenda-date-header');
    await sleep(800);
    expect(await pg.$$eval('.agenda-layer-clock', e => e.length) === 0, 'shown with cal_clock off');
    await pg.evaluate(() => fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cal_clock: true }) }));
}));
