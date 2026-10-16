// Month: clicking a day opens that day in Day view (it opened the new-task editor; adding happens
// in Day view, by clicking a time). Week: clicking a day's name opens that day in Day view.
const { check, expect, B, sleep } = require('./lib.cjs');
async function state(pg) {
    return pg.evaluate(() => ({
        fc:     calendar.view.type,
        date:   calendar.view.currentStart.toISOString(),
        local:  calendar.formatIso(calendar.view.currentStart, true),
        view:   document.getElementById('calendar').dataset.view,
        active: [...document.querySelectorAll('.view-btn[data-view].active')].map(b => b.dataset.view),
        editor: !!document.querySelector('#unified-task-editor.show, #unified-task-editor[style*="block"]'),
    }));
}
function inDay(s, date, where) {
    expect(s.fc === 'timeGridDay', `${where}: view is ${s.fc}`);
    expect(s.local === date, `${where}: day shown is ${s.local}, wanted ${date}`);
    expect(s.view === 'day' && s.active.join() === 'day', `${where}: data-view ${s.view}, active ${JSON.stringify(s.active)}`);
    expect(!s.editor, `${where}: the new-task editor opened`);
}
check(async pg => {
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-ev-title');

    // Month: a day of this month that isn't today
    await pg.click('.view-btn[data-view="month"]');
    await pg.waitForSelector('.fc-daygrid-day.fc-day-today');
    const mdate = await pg.$eval('.fc-daygrid-day.fc-day-today', el => {
        const days = [...document.querySelectorAll('.fc-daygrid-day:not(.fc-day-other):not(.fc-day-today)')];
        return days[Math.floor(days.length / 2)].dataset.date;
    });
    await pg.click(`.fc-daygrid-day[data-date="${mdate}"] .fc-daygrid-day-frame`, { force: true });
    await sleep(300);
    inDay(await state(pg), mdate, 'month day click');

    // Week: a day's name in the header
    await pg.click('.view-btn[data-view="week"]');
    await pg.waitForSelector('.fc-timeGridWeek-view .fc-col-header-cell');
    const wdate = await pg.$$eval('.fc-col-header-cell[data-date]', els => els[2].dataset.date);
    await pg.click(`.fc-col-header-cell[data-date="${wdate}"] .fc-col-header-cell-cushion`);
    await sleep(300);
    inDay(await state(pg), wdate, 'week header click');
});
