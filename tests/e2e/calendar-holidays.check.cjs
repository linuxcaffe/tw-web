// Holidays in the Calendar (plan tw:docs/tw-holidays-and-layers-plan.md): all-day bars, a range
// as one bar; can't be dragged; a click opens nothing; hover says what it is; not counted.
const { check, expect, B, sleep, withHolidays } = require('./lib.cjs');
const mon = -((new Date().getDay() + 6) % 7);          // this week's Monday (weeks start Monday)
check(async pg => withHolidays([['Week Day', 0], ['Long Break', mon, mon + 1]], async () => {
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.tw-layer-holidays');
    await sleep(500);

    // Week view: in the all-day row; the range is one bar
    const week = await pg.$$eval('.tw-layer-holidays', els => els.map(e => ({
        text: e.textContent, title: e.title, allday: !!e.closest('.fc-timegrid .fc-daygrid-body'),
        drag: e.classList.contains('fc-event-draggable'), w: e.getBoundingClientRect().width })));
    const wd = week.find(x => x.text.includes('Week Day'));
    expect(wd && wd.allday && !wd.drag, `Week Day: ${JSON.stringify(week)}`);
    expect(wd.title === 'Week Day (E2E)', `hover: ${wd.title}`);
    const br = week.filter(x => x.text.includes('Long Break'));
    expect(br.length === 1 && br[0].w > wd.w * 1.5, `Long Break (Mon–Tue) not one two-day bar: ${JSON.stringify(br)}`);

    const count = await pg.$eval('#tw-nav-bar', e => e.textContent);
    await pg.click('.tw-layer-holidays >> text=Week Day');
    await sleep(400);
    expect(!(await pg.$eval('#task-detail-modal', m => m.classList.contains('show'))), 'a click opened the task modal');
    expect(await pg.$eval('#tw-nav-bar', e => e.textContent) === count, 'nav count changed');

    // Month view: both there
    await pg.click('.view-btn[data-view="month"]');
    await sleep(800);
    const month = await pg.$$eval('.tw-layer-holidays', els => els.map(e => e.textContent));
    expect(month.some(t => t.includes('Week Day')) && month.some(t => t.includes('Long Break')),
           `month: ${JSON.stringify(month)}`);
}));
