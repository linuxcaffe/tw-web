// Daylight in the Calendar's time column (user, 2026-10-17): a cyan stripe from sunrise to sunset
// (sun.js, for the settings' place, default Toronto), with no tint behind the hour labels, which
// it made hard to read. Day view uses its day, Week the middle of the week. Hovering the column
// gives the times. Toronto, 21 Dec: sunrise 7:47, sunset 16:43; 21 Jun: 5:36, 21:03.
const { check, expect, B, sleep } = require('./lib.cjs');

// The stripe's ends as minutes of the day, from where it sits on the 24-hour grid
const stripe = pg => pg.evaluate(() => {
    const el = document.querySelector('#calendar .tw-daylight');
    const grid = document.querySelector('#calendar .fc-timegrid-slots table').getBoundingClientRect();
    const labels = [...document.querySelectorAll('#calendar td.fc-timegrid-slot-label')];
    const tinted = labels.filter(td => getComputedStyle(td).backgroundImage !== 'none').length;
    const axis = document.querySelector('#calendar .fc-timegrid-cols td.fc-timegrid-axis');
    if (!el) return { tinted, tip: axis?.title || '' };
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const min = y => (y - grid.top) / grid.height * 1440;
    return { from: min(r.top), to: min(r.bottom), width: r.width, left: r.left - grid.left,
             color: cs.backgroundColor, tinted, tip: axis?.title || '' };
});
async function open(pg, date, view) {
    await pg.goto(`${B}/calendar-planner.html?date=${date}&view=${view}`);
    await pg.waitForSelector('#calendar td.fc-timegrid-slot-label[data-time]');
    await sleep(600);
    return stripe(pg);
}
const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const near = (got, want) => Math.abs(got - hm(want)) <= 6;
const say = s => JSON.stringify({ ...s, from: Math.round(s.from), to: Math.round(s.to) });

// Settings outlive a run (run.py re-seeds tasks only): start from Toronto, and put it back
const TORONTO = { cal_daylight: true, cal_latitude: 43.65, cal_longitude: -79.38 };
const saveConfig = (pg, cfg) => pg.evaluate(cfg => fetch('/api/config', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) }).then(r => r.json()), cfg);

check(async pg => {
    await pg.setViewportSize({ width: 1280, height: 800 });
    await pg.goto(B + '/calendar-planner.html');
    await saveConfig(pg, TORONTO);

    let s = await open(pg, '20261221', 'day');
    expect(near(s.from, '7:47') && near(s.to, '16:43'), `winter stripe: ${say(s)}`);
    expect(s.tinted === 0, `hour labels have a background: ${s.tinted}`);
    expect(s.width >= 2 && s.width <= 6 && s.left <= 1, `a thin stripe at the column's left edge: ${say(s)}`);
    expect(s.color === 'rgb(0, 188, 212)', `stripe colour ${s.color}, want cyan`);
    expect(/Sunrise 7:4\d/.test(s.tip) && /Sunset 4:4\d/.test(s.tip), `hover text: ${JSON.stringify(s.tip)}`);

    s = await open(pg, '20260621', 'day');
    expect(near(s.from, '5:36') && near(s.to, '21:03'), `summer stripe: ${say(s)}`);

    s = await open(pg, '20261221', 'week');   // Dec 20–26: the 23rd, near enough the 21st
    expect(near(s.from, '7:48') && near(s.to, '16:45'), `winter week stripe: ${say(s)}`);
    expect(/mid-week/.test(s.tip), `week hover text: ${JSON.stringify(s.tip)}`);

    // Settings: the checkbox and the place are saved (the scratch server's own settings file)
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
    // Miami (same zone, further south), 21 Dec: sunrise 7:03, sunset 17:35
    s = await open(pg, '20261221', 'day');
    expect(near(s.from, '7:03') && near(s.to, '17:35'), `Miami winter stripe: ${say(s)}`);
    await saveConfig(pg, TORONTO);

    // Off: no stripe, no hover text (stubbed in the browser, so nothing more is saved)
    await pg.route('**/api/config', async route => {
        const r = await route.fetch();
        await route.fulfill({ response: r, json: { ...(await r.json()), cal_daylight: false } });
    });
    s = await open(pg, '20260621', 'day');
    expect(s.from === undefined && !s.tip, `daylight shown with cal_daylight off: ${JSON.stringify(s)}`);
});
