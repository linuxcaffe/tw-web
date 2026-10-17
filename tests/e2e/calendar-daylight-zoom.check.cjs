// The daylight stripe stays right through repeated zoom steps (user, 2026-10-17: "on repeated
// zooming, the gradient falls apart"). At every step its ends must sit in the label rows that
// hold sunrise and sunset.
const { check, expect, B, sleep } = require('./lib.cjs');
const TORONTO = { cal_daylight: true, cal_latitude: 43.65, cal_longitude: -79.38 };

const state = pg => pg.evaluate(() => {
    const v = calendar.view;
    const day = v.type === 'timeGridWeek' ? new Date(v.currentStart.getTime() + 3 * 864e5) : v.currentStart;
    const sun = TW.sun.times(day, _calSettings.cal_latitude, _calSettings.cal_longitude);
    const el = document.querySelector('#calendar .tw-daylight');
    const tds = [...document.querySelectorAll('#calendar td.fc-timegrid-slot-label[data-time]')];
    const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const rowAt = y => {   // [from, to] minutes of the label row at y
        const i = tds.findIndex(td => { const r = td.getBoundingClientRect(); return y >= r.top - 0.5 && y < r.bottom + 0.5; });
        return i < 0 ? null : [mins(tds[i].dataset.time), i + 1 < tds.length ? mins(tds[i + 1].dataset.time) : 1440];
    };
    if (!el) return { rows: tds.length, missing: true };
    const r = el.getBoundingClientRect();
    return { rows: tds.length, sun: [sun.sunrise, sun.sunset], top: rowAt(r.top + 0.5), bottom: rowAt(r.bottom - 0.5) };
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
            const s = await state(pg);
            const at = `${view} zoom step ${step} (${s.rows} rows)`;
            expect(!s.missing, `${at}: no stripe`);
            const [rise, set] = s.sun;
            expect(s.top && s.top[0] <= rise && rise < s.top[1], `${at}: stripe starts in row ${JSON.stringify(s.top)}, sunrise ${Math.round(rise)}`);
            expect(s.bottom && s.bottom[0] <= set && set < s.bottom[1], `${at}: stripe ends in row ${JSON.stringify(s.bottom)}, sunset ${Math.round(set)}`);
            await pg.click(`.view-btn[data-view="${view}"]`);   // the next zoom step
            await sleep(600);
        }
    }
});
