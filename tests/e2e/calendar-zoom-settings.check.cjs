// The Settings form edits the zoom steps (saved as they change): a step changed and made the default there is where
// Week opens after a reload.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    await pg.setViewportSize({ width: 1280, height: 800 });
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-timegrid-body');
    await pg.click('#tw-logo-btn');
    await pg.click('[data-menu="settings"]');
    await pg.waitForSelector('.tws-section-hdr');
    await sleep(400);   // the menu slides in
    const hdr = pg.locator('.tws-section-hdr', { hasText: 'Calendar' });
    if (!(await pg.locator('.tws-zoom-step').first().isVisible())) await hdr.click();
    const first = pg.locator('.tws-zoom-step[data-view="week"]').first();
    await first.locator('.tws-zoom-slot').selectOption('00:20:00');
    await first.locator('.tws-zoom-start').fill('07:00');
    await first.locator('input[type=radio]').check();
    await sleep(800);
    const z = await pg.evaluate(() => fetch('/api/config').then(r => r.json()).then(c => c.cal_zoom.week));
    expect(z.default === 0 && JSON.stringify(z.steps) ===
        JSON.stringify([['00:20:00', '07:00:00'], ['00:30:00', '08:00:00'], ['01:00:00', '00:00:00']]),
        `saved ${JSON.stringify(z)}`);
    await pg.reload();
    await pg.waitForSelector('.fc-timegrid-body');
    await sleep(800);
    const at = await pg.evaluate(() => {
        const sc = document.querySelector('.fc-timegrid-body').closest('.fc-scroller').getBoundingClientRect();
        const top = [...document.querySelectorAll('.fc-timegrid-slot-lane')].find(e => e.getBoundingClientRect().top >= sc.top - 2);
        return [calendar.getOption('slotDuration'), top && top.dataset.time];
    });
    expect(at[1] === '07:00:00' && JSON.stringify(at[0]).includes('20'), `Week opened at ${JSON.stringify(at)}`);
    // settings.json is the app folder's: put the defaults back for the checks that follow
    await pg.evaluate(() => fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cal_zoom: { week: { steps: [['00:15', '08:00'], ['00:30', '08:00'], ['01:00', '00:00']], default: 1 },
                                           day:  { steps: [['00:15', '08:00'], ['00:30', '08:00'], ['01:00', '00:00']], default: 1 } } }) }));
});
