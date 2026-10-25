// Zoom steps: clicking the active Week/Day button steps through three (row size, start hour)
// pairs from settings (cal_zoom), each opening at its own start hour; a view change or a reload
// goes back to that view's default. Week headers show the weekday only. A narrow window with a
// mouse keeps the calendar scrolling in its own box.
const { check, expect, B, sleep } = require('./lib.cjs');
const state = pg => pg.evaluate(() => {
    const sc = document.querySelector('.fc-timegrid-body').closest('.fc-scroller').getBoundingClientRect();
    const top = [...document.querySelectorAll('.fc-timegrid-slot-lane')]
        .find(e => e.getBoundingClientRect().top >= sc.top - 2);
    const d = calendar.getOption('slotDuration');
    const slot = typeof d === 'string' ? d : `${String(d.hours || 0).padStart(2, '0')}:${String(d.minutes || 0).padStart(2, '0')}:00`;
    return `${slot}@${top && top.dataset.time}`;
});
check(async pg => {
    await pg.setViewportSize({ width: 1280, height: 800 });
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-timegrid-body');
    await sleep(800);
    const seen = [await state(pg)];
    for (let i = 0; i < 3; i++) { await pg.click('.view-btn[data-view="week"]'); await sleep(500); seen.push(await state(pg)); }
    expect(JSON.stringify(seen) === JSON.stringify(
        ['00:30:00@08:00:00', '01:00:00@00:00:00', '00:15:00@08:00:00', '00:30:00@08:00:00']),
        `week steps went ${JSON.stringify(seen)}`);
    await pg.click('.view-btn[data-view="week"]'); await sleep(400);          // to 60 min
    await pg.click('.view-btn[data-view="day"]');  await sleep(500);
    expect(await state(pg) === '00:30:00@08:00:00', `Day opened at ${await state(pg)}`);
    await pg.click('.view-btn[data-view="week"]'); await sleep(500);
    expect(await state(pg) === '00:30:00@08:00:00', `back to Week at ${await state(pg)}`);
    const heads = await pg.$$eval('.fc-col-header-cell-cushion', els => els.map(e => e.textContent.trim()));
    expect(heads[0] === 'Mon', `week headers read ${JSON.stringify(heads)}`);

    // a narrow window with a mouse: the calendar keeps its own scroller, the page stays put (the
    // phone layout's sticky bars are calendar-phone-sticky-bar's, with a finger)
    await pg.setViewportSize({ width: 400, height: 800 });
    await sleep(800);
    await pg.evaluate(() => window.scrollTo(0, 600)); await sleep(400);
    const r = await pg.evaluate(() => ({
        page: scrollY,
        own: (sc => sc.scrollHeight > sc.clientHeight)(document.querySelector('.fc-timegrid-body').closest('.fc-scroller')),
    }));
    expect(r.page === 0 && r.own, `narrow with a mouse: the page scrolled to ${r.page}, the calendar's own scroller ${r.own ? 'scrolls' : "doesn't"}`);
});
