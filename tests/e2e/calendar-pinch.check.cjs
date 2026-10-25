// Pinch on a phone steps through Week's and Day's zoom steps (user 2026-10-24): spread for finer rows,
// pinch together for coarser ones, one step for each ~40% the fingers move, the hour under the fingers
// staying put. The browser's own page zoom no longer happens over the grid; a pinch over a task
// doesn't move it.
const { check, expect, task, B, sleep } = require('./lib.cjs');
check(async pg => {
    task('add', 'scheduled:today+10h', '--', 'Pinch over me');
    const ctx = await pg.context().browser().newContext({ viewport: { width: 390, height: 740 }, isMobile: true,
                                                          hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    const touches = (type, pts) => cdp.send('Input.dispatchTouchEvent',
        { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    // two fingers around (x, y), from `from` px apart to `to` px apart, vertically
    async function pinch(x, y, from, to, steps = 10) {
        await touches('touchStart', [[x, y - from / 2]]);
        await touches('touchStart', [[x, y - from / 2], [x, y + from / 2]]);
        for (let i = 1; i <= steps; i++) {
            const d = from + (to - from) * i / steps;
            await touches('touchMove', [[x, y - d / 2], [x, y + d / 2]]);
            await sleep(30);
        }
        await touches('touchEnd', []);
        await sleep(600);
    }
    // high on the screen: at 60 min rows the day is short, and the page can't scroll far enough to
    // keep a late hour low down
    const state = () => p.evaluate(y => {   // row size, the time at y, the page's zoom
        const lanes = [...document.querySelectorAll('.fc-timegrid-slot-lane')];
        const lane = lanes.find(l => { const r = l.getBoundingClientRect(); return r.top <= y && r.bottom > y; });
        const r = lane.getBoundingClientRect();
        const [h, m] = lane.dataset.time.split(':').map(Number);
        const slot = calendar.getOption('slotDuration');
        const mins = typeof slot === 'string' ? +slot.slice(0, 2) * 60 + +slot.slice(3, 5) : slot.minutes ?? slot.milliseconds / 60000;
        return { slot: mins, at: h * 60 + m + (y - r.top) / r.height * mins, scale: visualViewport.scale };
    }, 250);

    await p.goto(B + '/calendar-planner.html');
    await p.waitForSelector('.fc-timegrid-body');
    await sleep(1200);
    // the scratch settings have no cal_zoom: the fallback's steps are 15, 30 (where it opens) and 60 min
    const s0 = await state();
    expect(s0.slot === 30, `Week opened at ${s0.slot} min rows`);
    await pinch(200, 250, 80, 150);
    const s1 = await state();
    expect(s1.scale === 1, `the page zoomed to ${s1.scale}`);
    expect(s1.slot === 15, `spreading the fingers gave ${s1.slot} min rows, not 15`);
    expect(Math.abs(s1.at - s0.at) <= 20, `the time under the fingers moved from ${s0.at} to ${s1.at} min` + await p.evaluate(() => (window.__d||[]).join('\n')));
    await pinch(200, 250, 80, 150);
    expect((await state()).slot === 15, 'spreading at the finest step went past it');
    await pinch(200, 250, 160, 50);   // both fingers on the grid, under the sticky rows
    const s2 = await state();
    expect(s2.slot === 60, `a long pinch together gave ${s2.slot} min rows, not 60 (two steps)`);
    // at 60 min rows the whole day nearly fits: the page may already be as far down as it goes
    const end = await p.evaluate(() => scrollY >= document.documentElement.scrollHeight - innerHeight - 1);
    expect(Math.abs(s2.at - s0.at) <= 30 || end, `the time under the fingers moved from ${s0.at} to ${s2.at} min`);
    expect(s2.scale === 1, `the page zoomed to ${s2.scale}`);

    // over a task: a pinch, never a drag
    await p.click('.view-btn[data-view="day"]');
    await sleep(800);
    await p.$eval('.fc-timegrid-event', e => e.scrollIntoView({ block: 'center' }));
    await sleep(300);
    const ev = await p.$eval('.fc-timegrid-event', e => { const r = e.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const put = p.waitForRequest(r => r.method() === 'PUT' && r.url().includes('/modify'), { timeout: 2500 }).catch(() => null);
    await touches('touchStart', [[ev.x, ev.y]]);
    await sleep(100);   // fingers land close together; past the long press it's a drag already, and stays one
    await touches('touchStart', [[ev.x, ev.y], [ev.x, ev.y + 60]]);
    for (let i = 1; i <= 10; i++) { await touches('touchMove', [[ev.x, ev.y - i * 5], [ev.x, ev.y + 60 + i * 5]]); await sleep(30); }
    await touches('touchEnd', []);
    expect(!(await put), 'a pinch over a task moved it');
});
