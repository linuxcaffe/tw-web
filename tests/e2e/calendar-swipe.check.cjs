// A decided sideways swipe on the Calendar goes to the next or previous week, day or month, on a phone
// (user 2026-10-24). A short flick, a mostly vertical swipe and a held task dragged sideways don't.
const { check, expect, task, B, sleep } = require('./lib.cjs');
check(async pg => {
    task('add', 'scheduled:today+10h', '--', 'Swipe over me');
    const ctx = await pg.context().browser().newContext({ viewport: { width: 390, height: 740 }, isMobile: true,
                                                          hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent',
        { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const start = () => p.evaluate(() => calendar.view.currentStart.toISOString());
    async function swipe(x, y, dx, dy, { hold = 0, steps = 8 } = {}) {
        await touch('touchStart', x, y);
        if (hold) await sleep(hold);
        for (let i = 1; i <= steps; i++) { await touch('touchMove', x + dx * i / steps, y + dy * i / steps); await sleep(16); }
        await touch('touchEnd');
        await sleep(600);   // the slide
    }
    await p.goto(B + '/calendar-planner.html');
    await p.waitForSelector('.fc-event');
    for (const view of ['timeGridWeek', 'timeGridDay', 'dayGridMonth']) {
        await p.evaluate(v => calendar.changeView(v), view);
        await sleep(400);
        const box = await p.$eval('.fc-view-harness', e => { const r = e.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: Math.min(r.top + 200, innerHeight - 100) }; });
        const s0 = await start();
        await swipe(box.x + 100, box.y, -200, 10);
        const s1 = await start();
        expect(s1 > s0, `${view}: a swipe to the left did not go to the next (${s0} → ${s1})`);
        await swipe(box.x - 100, box.y, 200, -10);
        expect(await start() === s0, `${view}: a swipe to the right did not come back (${await start()})`);
        await swipe(box.x, box.y, -40, 0);
        expect(await start() === s0, `${view}: a 40 px flick changed the dates`);
        await swipe(box.x, box.y, -90, 200);
        expect(await start() === s0, `${view}: a mostly vertical swipe changed the dates`);
    }
    // over a task: a quick swipe still navigates; a held task dragged sideways is a drag, not a swipe
    await p.evaluate(() => calendar.changeView('timeGridWeek'));
    await p.evaluate(() => calendar.today());
    await sleep(400);
    await p.$eval('.fc-timegrid-event', e => e.scrollIntoView({ block: 'center' }));
    await sleep(300);
    let ev = await p.$eval('.fc-timegrid-event', e => { const r = e.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 8 }; });
    const s0 = await start();
    await swipe(ev.x, ev.y, -200, 0);
    expect(await start() > s0, 'a quick swipe starting on a task did not go to the next week');
    await p.evaluate(() => calendar.today());
    await sleep(400);
    ev = await p.$eval('.fc-timegrid-event', e => { const r = e.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 8 }; });
    const put = p.waitForRequest(r => r.method() === 'PUT' && r.url().includes('/modify'), { timeout: 3000 }).catch(() => null);
    await swipe(ev.x, ev.y, ev.x > 200 ? -60 : 60, 0, { hold: 500, steps: 12 });
    expect(await start() === s0, 'dragging a held task sideways changed the week');
    expect(await put, 'dragging a held task sideways did not move it');
});
