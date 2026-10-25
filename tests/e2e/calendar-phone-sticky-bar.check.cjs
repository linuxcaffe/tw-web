// On a phone the date row (◀ title, Today, Day, Week, Month ▶) stays under the nav bar when the page
// scrolls in Week and Day, with the day names under it, so after a swipe you can still see where you
// are (user 2026-10-24). They open scrolled down to their start hour, which used to hide it.
// Month doesn't need it: there the row scrolls away and the day names stick to the nav bar.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    const ctx = await pg.context().browser().newContext({ viewport: { width: 390, height: 740 }, isMobile: true,
                                                          hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent',
        { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const layout = () => p.evaluate(() => {
        const r = sel => document.querySelector(sel)?.getBoundingClientRect();
        const nav = r('#tw-nav-bar'), bar = r('.cal-topbar'), head = r('#calendar .fc-col-header');
        return { scrollY, nav: Math.round(nav.bottom), bar: [Math.round(bar.top), Math.round(bar.bottom)],
                 head: head && Math.round(head.top), title: document.getElementById('calendar-title').textContent };
    });
    await p.goto(B + '/calendar-planner.html');
    await p.waitForSelector('.fc-timegrid-body');
    await sleep(1200);
    for (const view of ['week', 'day']) {
        await p.click(`.view-btn[data-view="${view}"]`);
        await sleep(600);
        await p.evaluate(() => scrollBy(0, 400));
        await sleep(300);
        const l = await layout();
        expect(l.scrollY > 100, `${view}: the page didn't scroll (${l.scrollY})`);
        expect(Math.abs(l.bar[0] - l.nav) <= 1, `${view}: the date row is at ${l.bar[0]}, not under the nav bar (${l.nav})`);
        expect(Math.abs(l.head - l.bar[1]) <= 1, `${view}: the day names are at ${l.head}, not under the date row (${l.bar[1]})`);
    }
    // Month: a short phone screen and a tall month, so the page scrolls
    await p.setViewportSize({ width: 390, height: 420 });
    await p.click('.view-btn[data-view="month"]');
    await sleep(600);
    await p.evaluate(() => scrollBy(0, 300));
    await sleep(300);
    const m = await layout();
    expect(m.scrollY > 100, `month: the page didn't scroll (${m.scrollY})`);
    expect(m.bar[1] <= m.nav, `month: the date row stayed in sight (${m.bar}, nav ends at ${m.nav})`);
    expect(Math.abs(m.head - m.nav) <= 1, `month: the day names are at ${m.head}, not under the nav bar (${m.nav})`);
    await p.setViewportSize({ width: 390, height: 740 });
    await p.click('.view-btn[data-view="week"]');
    await sleep(600);
    const before = (await layout()).title;
    await touch('touchStart', 300, 500);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', 300 - 25 * i, 500); await sleep(16); }
    await touch('touchEnd');
    await sleep(900);
    const after = await layout();
    expect(after.title !== before && Math.abs(after.bar[0] - after.nav) <= 1,
        `after a swipe the title is ${after.title} (was ${before}) and the date row at ${after.bar[0]}`);
});
