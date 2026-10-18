// The Calendar opens in the Settings default view (cal_default_view) with that view's button
// highlighted, not the page's hard-coded Week.
const { check, expect, B } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-view');
    await pg.evaluate(() => fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cal_default_view: 'dayGridMonth' }) }));
    await pg.reload();
    await pg.waitForSelector('.fc-daygrid-body');
    const st = await pg.evaluate(() => ({
        active: [...document.querySelectorAll('.view-btn.active[data-view]')].map(b => b.dataset.view),
        data:   document.getElementById('calendar').dataset.view,
    }));
    expect(JSON.stringify(st.active) === '["month"]' && st.data === 'month', `Month opened with ${JSON.stringify(st)}`);
    await pg.evaluate(() => fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cal_default_view: 'timeGridWeek' }) }));
});
