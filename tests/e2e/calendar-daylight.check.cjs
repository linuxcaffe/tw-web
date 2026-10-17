// The time column tints daylight blue (user, 2026-10-17), fading through civil twilight: sun.js
// for the settings' place, default Toronto. Day view uses its day, Week the middle of the week.
// Toronto: 21 Dec dawn 7:15, sunrise 7:47, sunset 16:43, dusk 17:15; 21 Jun 5:01, 5:36, 21:03, 21:38.
const { check, expect, B, sleep } = require('./lib.cjs');

// Each label cell's tint: the alphas of its gradient stops ([] for none)
const tints = pg => pg.$$eval('#calendar td.fc-timegrid-slot-label[data-time]', tds => Object.fromEntries(
    tds.map(td => [td.dataset.time.slice(0, 5),
                   [...getComputedStyle(td).backgroundImage.matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)].map(m => +m[1])])));
async function open(pg, date, view) {
    await pg.goto(`${B}/calendar-planner.html?date=${date}&view=${view}`);
    await pg.waitForSelector('#calendar td.fc-timegrid-slot-label[data-time]');
    await sleep(600);
    return tints(pg);
}
const none = a => a.length === 0 || a.every(x => x === 0);
const full = a => a.length > 0 && a.every(x => x > 0.1) && Math.min(...a) === Math.max(...a);
const fade = a => a.length > 1 && Math.max(...a) - Math.min(...a) > 0.05;   // changes across the cell
const show = (t, keys) => keys.map(k => `${k}:${JSON.stringify(t[k])}`).join(' ');

// Settings outlive a run (run.py re-seeds tasks only): start from Toronto, and put it back
const TORONTO = { cal_daylight: true, cal_latitude: 43.65, cal_longitude: -79.38 };
const saveConfig = (pg, cfg) => pg.evaluate(cfg => fetch('/api/config', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) }).then(r => r.json()), cfg);

check(async pg => {
    await pg.setViewportSize({ width: 1280, height: 800 });
    await pg.goto(B + '/calendar-planner.html');
    await saveConfig(pg, TORONTO);

    let t = await open(pg, '20261221', 'day');
    expect(none(t['03:00']) && none(t['20:00']), `winter night tinted: ${show(t, ['03:00', '20:00'])}`);
    expect(full(t['12:00']) && full(t['08:00']), `winter day not tinted: ${show(t, ['08:00', '12:00'])}`);
    expect(fade(t['07:00']) && fade(t['17:00']), `winter twilight no fade: ${show(t, ['07:00', '17:00'])}`);
    expect(none(t['18:00']) && full(t['16:00']), `winter evening: ${show(t, ['16:00', '18:00'])}`);

    t = await open(pg, '20260621', 'day');
    expect(full(t['06:00']) && full(t['20:00']), `summer day: ${show(t, ['06:00', '20:00'])}`);
    expect(fade(t['05:00']) && none(t['04:00']) && none(t['22:00']), `summer edges: ${show(t, ['04:00', '05:00', '22:00'])}`);

    t = await open(pg, '20261221', 'week');   // Dec 20–26: same as the 21st, near enough
    expect(none(t['18:00']) && full(t['12:00']) && fade(t['07:00']), `winter week: ${show(t, ['07:00', '12:00', '18:00'])}`);

    // Settings: the checkbox and the place are saved (the scratch server's own settings.json)
    await pg.click('#tw-logo-btn');
    await pg.click('[data-menu="settings"]');
    await pg.waitForSelector('.tws-section-hdr');
    await sleep(400);
    if (!(await pg.locator('#tws-cal-lat').isVisible())) await pg.locator('.tws-section-hdr', { hasText: 'Calendar' }).click();
    expect(await pg.isChecked('#tws-cal-daylight'), 'daylight not on by default');
    expect(await pg.inputValue('#tws-cal-lat') === '43.65', 'latitude not Toronto by default');
    await pg.fill('#tws-cal-lat', '25.76');
    await pg.fill('#tws-cal-lon', '-80.19');
    await pg.click('button[type=submit]:has-text("Save")');
    await sleep(800);
    const cfg = await pg.evaluate(() => fetch('/api/config').then(r => r.json()));
    expect(cfg.cal_latitude === 25.76 && cfg.cal_longitude === -80.19 && cfg.cal_daylight === true,
           `saved ${JSON.stringify([cfg.cal_daylight, cfg.cal_latitude, cfg.cal_longitude])}`);
    // Miami (same zone, further south) in December: still full day at 17:00 (sunset 17:35),
    // where Toronto was already fading
    t = await open(pg, '20261221', 'day');
    expect(full(t['17:00']) && full(t['12:00']), `Miami winter: ${show(t, ['12:00', '17:00'])}`);
    await saveConfig(pg, TORONTO);

    // Off: no tint (stubbed in the browser, so nothing more is saved)
    await pg.route('**/api/config', async route => {
        const r = await route.fetch();
        await route.fulfill({ response: r, json: { ...(await r.json()), cal_daylight: false } });
    });
    t = await open(pg, '20260621', 'day');
    expect(none(t['12:00']), `tinted with cal_daylight off: ${show(t, ['12:00'])}`);
});
