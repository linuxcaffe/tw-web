// A narrow window with a mouse keeps the desktop layout: the calendar scrolls in its own box and the
// page never moves (user 2026-10-24, Epiphany at about half width: the wheel scrolled the page, and
// WebKit misplaced the sticky nav, date row and day names while it did). The phone layout (the page
// scrolls, the bars stick) is for a finger: narrow and pointer: coarse.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    for (const view of ['week', 'month']) {
        await pg.setViewportSize({ width: 741, height: 790 });
        await pg.goto(B + '/calendar-planner.html');
        await pg.waitForSelector('.fc-view');
        await sleep(1000);
        if (view !== 'week') { await pg.click(`.view-btn[data-view="${view}"]`); await sleep(600); }
        const fcBefore = await pg.evaluate(() => document.querySelector('.fc-timegrid-body')?.closest('.fc-scroller')?.scrollTop ?? null);
        await pg.mouse.move(370, 600);
        for (let i = 0; i < 8; i++) { await pg.mouse.wheel(0, 120); await sleep(60); }
        await sleep(500);
        const r = await pg.evaluate(() => ({
            page: Math.round(scrollY),
            fc: document.querySelector('.fc-timegrid-body')?.closest('.fc-scroller')?.scrollTop ?? null,
            nav: Math.round(document.getElementById('tw-nav-bar').getBoundingClientRect().top),
        }));
        expect(r.page === 0 && r.nav === 0, `${view}: the wheel scrolled the page to ${r.page} (nav bar at ${r.nav})`);
        if (view === 'week') expect(r.fc > fcBefore, `week: the calendar's own box didn't scroll (${fcBefore} → ${r.fc})`);
    }
});
