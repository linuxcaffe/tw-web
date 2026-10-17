// The moon's phases and the seasons in the Calendar (tw-events sky.rc; user 2026-10-17: "mark at
// its time"): Week and Day draw a mark across the day's column at the moment, with its icon (hover:
// name and time), and keep it out of the all-day row; Month shows a chip with the icon. Zoom steps
// don't move it off its time.
const { check, expect, B, sleep, withHolidays } = require('./lib.cjs');
const mon = -((new Date().getDay() + 6) % 7);          // this week's Monday
const marks = pg => pg.$$eval('#calendar .tw-sky-mark', els => els.map(m => {
    const f = m.closest('.fc-timegrid-col-frame').getBoundingClientRect(), r = m.getBoundingClientRect();
    return { date: m.closest('.fc-timegrid-col').dataset.date, frac: (r.top - f.top) / f.height,
             icon: m.textContent, title: m.querySelector('.tw-sky-icon').title };
}));
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
check(async pg => withHolidays([
    ['Full Moon', 0, undefined, { kind: 'moon', time: '15:30' }],
    ['March Equinox', mon, undefined, { kind: 'season', time: '03:00' }],
    ['Week Day', 0],
], async () => {
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.tw-sky-mark');
    await sleep(500);
    let m = await marks(pg);
    const moon = m.find(x => x.title === 'Full Moon 15:30');
    expect(moon && moon.date === iso(0) && moon.icon === '🌕', `moon mark: ${JSON.stringify(m)}`);
    expect(Math.abs(moon.frac - 15.5 / 24) < 0.01, `moon at ${(moon.frac * 24).toFixed(2)} h, want 15.5`);
    const eq = m.find(x => x.title === 'March Equinox 03:00');
    expect(eq && eq.date === iso(mon) && Math.abs(eq.frac - 3 / 24) < 0.01, `equinox: ${JSON.stringify(m)}`);
    expect(await pg.$$eval('.tw-layer-moment', e => e.length) === 0, 'a moment in the all-day row');
    expect(await pg.$$eval('.tw-layer-holidays', e => e.length) === 1, 'the holiday left the all-day row');

    await pg.click('.view-btn[data-view="week"]');      // next zoom step: rows change size
    await sleep(800);
    m = await marks(pg);
    const z = m.find(x => x.title === 'Full Moon 15:30');
    expect(z && Math.abs(z.frac - 15.5 / 24) < 0.01, `after zoom: ${JSON.stringify(m)}`);

    await pg.click('.view-btn[data-view="day"]');
    await sleep(800);
    m = await marks(pg);
    expect(m.length === 1 && m[0].title === 'Full Moon 15:30', `day view: ${JSON.stringify(m)}`);

    await pg.click('.view-btn[data-view="month"]');
    await sleep(800);
    const chips = await pg.$$eval('.tw-layer-moment', els => els.map(e => ({ text: e.textContent, title: e.title })));
    expect(chips.some(c => c.text.includes('🌕 Full Moon') && c.title.includes('15:30')),
           `month chips: ${JSON.stringify(chips)}`);
    expect(await pg.$$eval('.tw-sky-mark', e => e.length) === 0, 'marks left over in Month');

    await pg.click('.view-btn[data-view="week"]');
    await sleep(800);
    expect((await marks(pg)).length === 2, 'marks not back in Week');
}));
