// Touch drag on a phone (user 2026-10-24: "after grabbing a task to move it, and dragging it up or
// down, the timescale will drag with it", in all three views, in Brave). FullCalendar starts an event
// drag only after a long press; a real finger wobbles a few px during it, which used to start the
// page's own scroll, and once that runs FullCalendar can't stop it. A hold with a wobble must drag
// the task with the page staying put, in Week, Day and Month; a quick swipe over a task must still scroll.
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
    async function gesture(view, hold, wobble) {
        await p.goto(B + '/calendar-planner.html');
        await p.waitForSelector('.fc-event');
        await p.evaluate(v => calendar.changeView(v), view);
        await sleep(300);
        await p.$eval('.fc-event:not(.layer-event)', e => e.scrollIntoView({ block: 'center' }));
        await sleep(500);
        const ev = await p.$eval('.fc-event:not(.layer-event)', e => { const r = e.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + 8 }; });
        const before = await p.evaluate(() => scrollY);
        await touch('touchStart', ev.x, ev.y);
        for (let t = 0; t < hold / 50; t++) {    // a finger is never still: back and forth by `wobble` px
            await touch('touchMove', ev.x + (t % 2 ? wobble / 2 : 0), ev.y + (t % 2 ? wobble : 0));
            await sleep(50);
        }
        for (let i = 1; i <= 15; i++) { await touch('touchMove', ev.x, ev.y + i * 10); await sleep(40); }
        const during = await p.evaluate(() => ({ y: scrollY, mirror: !!document.querySelector('.fc-event-mirror, .fc-event-dragging') }));
        const put = p.waitForRequest(r => r.method() === 'PUT' && r.url().includes('/modify'), { timeout: 3000 })
            .catch(() => null);
        await touch('touchEnd');
        return { scrolled: during.y - before, mirror: during.mirror, put: await put };
    }

    for (const view of ['timeGridWeek', 'timeGridDay', 'dayGridMonth']) {
        const drag = await gesture(view, 500, 8);
        expect(drag.mirror, `${view}: a 500 ms hold did not start a drag`);
        expect(Math.abs(drag.scrolled) < 5, `${view}: the page scrolled ${drag.scrolled} px during the drag`);
        expect(drag.put, `${view}: the task was not moved`);
        if (view !== 'dayGridMonth')
            expect(/"scheduled":"\d{4}-\d\d-\d\dT1[1-9]:/.test(drag.put.postData()),
                   `${view}: the task was not moved later: ${drag.put.postData()}`);
        task('rc.confirmation=no', 'Drag', 'modify', 'scheduled:today+10h');
    }

    const swipe = await gesture('timeGridWeek', 0, 0);
    expect(!swipe.mirror && !swipe.put, 'a quick swipe over a task dragged it');
    expect(swipe.scrolled < -50, `a quick swipe did not scroll the page (${swipe.scrolled} px)`);
});
