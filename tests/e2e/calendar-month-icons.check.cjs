// Month view (user 2026-10-24): a layer item with an icon (moon, seasons, clock changes, a timed event
// of your own: 📌) is just its icon on the day's top row, left of the day number, the text in its
// tooltip; a click or a tap on it opens that day. Items without an icon (holidays, all-day events of
// your own) stay chips. No week-number column in Month (Week view keeps its W number). Day view
// shows each mark's text beside it.
const { check, expect, B, sleep, withHolidays } = require('./lib.cjs');
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const today = iso(0);
const icons = pg => pg.$$eval(`.fc-daygrid-day[data-date="${today}"] .fc-daygrid-day-top .tw-day-icon`,
    els => els.map(e => ({ icon: e.textContent, title: e.title, right: e.getBoundingClientRect().right })));
const number = pg => pg.$eval(`.fc-daygrid-day[data-date="${today}"] .fc-daygrid-day-number`, e => e.getBoundingClientRect().left);
const month = async pg => { await pg.click('.view-btn[data-view="month"]'); await pg.waitForSelector('.tw-day-icon'); await sleep(400); };
check(async pg => withHolidays([
    ['Full Moon', 0, undefined, { kind: 'moon', time: '15:30' }],
    ['Clocks back (EST)', 0, undefined, { kind: 'clock', time: '02:00' }],
    ['Dentist', 0, undefined, { kind: 'mine', time: '14:30' }],
    ['Cottage', 0, undefined, { kind: 'mine' }],
    ['Week Day', 0],
], async () => {
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-timegrid');
    expect(/W\s*\d+/.test(await pg.$eval('.fc-timegrid-axis', e => e.textContent)), 'Week view lost its week number');
    await month(pg);
    const ic = await icons(pg);
    expect(JSON.stringify(ic.map(i => [i.icon, i.title])) === JSON.stringify(
        [['📌', 'Dentist 14:30'], ['🌕', 'Full Moon 15:30'], ['🕐', 'Clocks back (EST) 02:00']]), `icons: ${JSON.stringify(ic)}`);
    const n = await number(pg);
    expect(ic.every(i => i.right <= n + 1), `icons not left of the day number (${n}): ${JSON.stringify(ic)}`);
    const chips = await pg.$$eval('.fc-daygrid-day .tw-layer', els => els.map(e => e.textContent.trim()));
    expect(JSON.stringify(chips.sort()) === JSON.stringify(['Cottage', 'Week Day']), `chips: ${JSON.stringify(chips)}`);
    expect(await pg.$$eval('.fc-daygrid-week-number', e => e.length) === 0, 'week numbers in Month');

    await pg.click(`.fc-daygrid-day[data-date="${today}"] .tw-day-icon[title^="Full Moon"]`);
    await sleep(800);
    expect(await pg.evaluate(() => calendar.view.type) === 'timeGridDay', 'a click on the icon did not open Day view');
    expect(await pg.evaluate(() => calendar.getDate().toDateString()) === new Date().toDateString(), 'Day view on another day');
    const labels = await pg.$$eval('.tw-sky-mark .tw-sky-label', els => els.map(e => e.textContent));
    expect(['Full Moon 15:30', 'Clocks back (EST) 02:00', 'Dentist 14:30'].every(l => labels.includes(l)),
           `Day view labels: ${JSON.stringify(labels)}`);
    await pg.click('.view-btn[data-view="week"]');
    await sleep(600);
    expect(await pg.$$eval('.tw-sky-mark .tw-sky-label', e => e.length) === 0, 'labels in Week view');

    // a phone: a tap on the icon opens the day too
    const ctx = await pg.context().browser().newContext({ viewport: { width: 390, height: 740 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(B + '/calendar-planner.html');
    await p.waitForSelector('.fc-timegrid');
    await month(p);
    await p.tap(`.fc-daygrid-day[data-date="${today}"] .tw-day-icon[title^="Full Moon"]`);
    await sleep(800);
    expect(await p.evaluate(() => calendar.view.type) === 'timeGridDay', 'a tap on the icon did not open Day view');
    await ctx.close();
}));
