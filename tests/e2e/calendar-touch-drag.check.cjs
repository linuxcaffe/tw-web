// Touch drag on a phone (user 2026-10-24: "after grabbing a task to move it, and dragging it up or
// down, the timescale will drag with it"). FullCalendar starts an event drag only after a long press;
// its default (1 s) turned every ordinary grab-and-move into a page scroll. A hold of half a second
// must drag the task, with the page staying put; a quick swipe over a task must still scroll.
const { check, expect, task, B, sleep } = require('./lib.cjs');
check(async pg => {
    task('add', 'scheduled:today+10h', '--', 'Drag me');
    const ctx = await pg.context().browser().newContext({ viewport: { width: 390, height: 740 }, isMobile: true,
                                                          hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    p.on('dialog', d => d.accept());
    const cdp = await ctx.newCDPSession(p);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent',
        { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    async function gesture(hold) {
        await p.goto(B + '/calendar-planner.html');
        await p.waitForSelector('.fc-timegrid-event');
        await p.$eval('.fc-timegrid-event', e => e.scrollIntoView({ block: 'center' }));
        await sleep(500);
        const ev = await p.$eval('.fc-timegrid-event', e => { const r = e.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + 8 }; });
        const before = await p.evaluate(() => scrollY);
        await touch('touchStart', ev.x, ev.y);
        await sleep(hold);
        for (let i = 1; i <= 15; i++) { await touch('touchMove', ev.x, ev.y + i * 10); await sleep(40); }
        const during = await p.evaluate(() => ({ y: scrollY, mirror: !!document.querySelector('.fc-event-mirror') }));
        const put = p.waitForRequest(r => r.method() === 'PUT' && r.url().includes('/modify'), { timeout: 3000 })
            .catch(() => null);
        await touch('touchEnd');
        return { scrolled: during.y - before, mirror: during.mirror, put: await put };
    }

    const drag = await gesture(500);
    expect(drag.mirror, 'a 500 ms hold did not start a drag');
    expect(Math.abs(drag.scrolled) < 5, `the page scrolled ${drag.scrolled} px during the drag`);
    expect(drag.put && /"scheduled":"\d{4}-\d\d-\d\dT1[1-9]:/.test(drag.put.postData()),
           `the task was not moved later: ${drag.put && drag.put.postData()}`);

    const swipe = await gesture(100);
    expect(!swipe.mirror && !swipe.put, 'a quick swipe over a task dragged it');
    expect(swipe.scrolled < -50, `a quick swipe did not scroll the page (${swipe.scrolled} px)`);
});
