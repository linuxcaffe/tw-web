// Settings save as you change them, with no Save button: the Calendar's default view (a select),
// a zoom step's minutes per block, a checkbox and a number, then the panel closed with Escape
// before a typed field lost focus. All of it is there after a reload.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    await pg.setViewportSize({ width: 1280, height: 800 });
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-view');
    const open = async () => {
        await pg.click('#tw-logo-btn');
        await pg.click('[data-menu="settings"]');
        await pg.waitForSelector('.tws-section-hdr');
        await sleep(400);   // the menu slides in
        if (!(await pg.locator('#tws-cal-view').isVisible()))
            await pg.locator('.tws-section-hdr', { hasText: 'Calendar' }).click();
    };
    await open();
    expect(!(await pg.locator('#tw-settings-form button[type=submit]').count()), 'there is still a Save button');
    await pg.selectOption('#tws-cal-view', 'timeGridDay');
    await pg.locator('.tws-zoom-step[data-view="day"]').nth(1).locator('.tws-zoom-slot').selectOption('00:20:00');
    await pg.uncheck('#tws-cal-moon');
    await pg.fill('#tws-cal-lat', '45.5');
    await sleep(1000);
    expect(/saved/i.test(await pg.locator('.tws-section-hdr', { hasText: 'Calendar' }).textContent()),
        'no "Saved" beside the Calendar header');
    await pg.focus('#tws-kanban');
    await pg.fill('#tws-kanban', 'one, two');
    await pg.keyboard.press('Escape');   // gone before the field's change event
    await sleep(1200);
    const c = await pg.evaluate(() => fetch('/api/config').then(r => r.json()));
    expect(c.cal_default_view === 'timeGridDay', `default view ${c.cal_default_view}`);
    expect(c.cal_zoom.day.steps[1][0] === '00:20:00', `day zoom ${JSON.stringify(c.cal_zoom.day)}`);
    expect(c.cal_moon === false && c.cal_latitude === 45.5, `moon ${c.cal_moon}, latitude ${c.cal_latitude}`);
    expect(c.kanban_columns.join() === 'one,two', `kanban ${c.kanban_columns}`);
    await pg.reload();
    await pg.waitForSelector('.fc-view');
    expect(await pg.evaluate(() => calendar.view.type) === 'timeGridDay', 'the Calendar did not open in Day');
    // the scratch settings last the whole run: put these back for the checks that follow
    await pg.evaluate(() => fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cal_default_view: 'timeGridWeek', cal_moon: true, cal_latitude: 43.65,
                               kanban_columns: 'backlog,todo,doing,review,done',
                               cal_zoom: { week: { steps: [['00:15', '08:00'], ['00:30', '08:00'], ['01:00', '00:00']], default: 1 },
                                           day:  { steps: [['00:15', '08:00'], ['00:30', '08:00'], ['01:00', '00:00']], default: 1 } } }) }));
});
