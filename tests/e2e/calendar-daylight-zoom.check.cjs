// The daylight tint stays right through repeated zoom steps (user, 2026-10-17: "on repeated
// zooming, the gradient falls apart"). After each click on Day, every time label's tint must match
// the sun for the stretch it now covers: its first and last stops are the tint at its two ends.
const { check, expect, B, sleep } = require('./lib.cjs');
const TORONTO = { cal_daylight: true, cal_latitude: 43.65, cal_longitude: -79.38 };

// [time, slot, want start, want end, got stops] for every label whose tint is wrong
const wrong = pg => pg.evaluate(() => {
    const v = calendar.view;
    const day = v.type === 'timeGridWeek' ? new Date(v.currentStart.getTime() + 3 * 864e5) : v.currentStart;
    const sun = TW.sun.times(day, _calSettings.cal_latitude, _calSettings.cal_longitude);
    const tds = [...document.querySelectorAll('#calendar td.fc-timegrid-slot-label[data-time]')];
    const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const out = [];
    tds.forEach((td, i) => {
        const a = mins(td.dataset.time), b = i + 1 < tds.length ? mins(tds[i + 1].dataset.time) : 1440;
        const got = [...getComputedStyle(td).backgroundImage.matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)].map(m => +m[1]);
        const want = [0.22 * TW.sun.tint(a, sun), 0.22 * TW.sun.tint(b, sun)];
        const first = got.length ? got[0] : 0, last = got.length ? got[got.length - 1] : 0;
        if (Math.abs(first - want[0]) > 0.01 || Math.abs(last - want[1]) > 0.01)
            out.push([td.dataset.time.slice(0, 5), b - a, want.map(x => +x.toFixed(3)), got]);
    });
    return { n: tds.length, out };
});

check(async pg => {
    await pg.setViewportSize({ width: 1280, height: 900 });
    await pg.goto(B + '/calendar-planner.html');
    await pg.evaluate(cfg => fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify(cfg) }), TORONTO);
    await pg.goto(B + '/calendar-planner.html?date=20261221&view=day');
    await pg.waitForSelector('#calendar td.fc-timegrid-slot-label[data-time]');
    await sleep(600);
    for (const view of ['day', 'week']) {
        await pg.click(`.view-btn[data-view="${view}"]`);   // Day again is a zoom step; Week switches
        await sleep(600);
        for (let step = 0; step <= 6; step++) {
            const w = await wrong(pg);
            expect(w.out.length === 0, `${view} zoom step ${step} (${w.n} rows): ${w.out.length} wrong, ` +
                                       `e.g. ${JSON.stringify(w.out.slice(0, 3))}`);
            await pg.click(`.view-btn[data-view="${view}"]`);   // the next zoom step
            await sleep(600);
        }
    }
});
