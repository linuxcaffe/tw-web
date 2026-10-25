// On a phone the page scrolls, not FullCalendar's scroller, so scrollToTime did nothing and Week and
// Day always opened at midnight (user 2026-10-24: "the early start is the least useful info"). A
// fresh page, a change of view and a zoom step put their start hour at the top, under the day names;
// Next and a swipe keep where you were; a reload starts at the start hour again.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    const ctx = await pg.context().browser().newContext({ viewport: { width: 390, height: 740 }, isMobile: true,
                                                          hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent',
        { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const topHour = () => p.evaluate(() => {   // the first row showing below the day names
        const top = document.querySelector('#calendar .fc-col-header').getBoundingClientRect().bottom;
        const lane = [...document.querySelectorAll('.fc-timegrid-slot-lane')]
            .find(e => e.getBoundingClientRect().bottom > top + 2);
        return lane && lane.dataset.time;
    });
    await p.goto(B + '/calendar-planner.html');
    await p.waitForSelector('.fc-timegrid-body');
    await sleep(1200);
    // the scratch settings have no cal_zoom: the fallback opens at its step 1, 08:00
    expect(await topHour() === '08:00:00', `a fresh Week opened at ${await topHour()}`);
    await p.click('.view-btn[data-view="month"]'); await sleep(500);
    await p.evaluate(() => scrollTo(0, 0));
    await p.click('.view-btn[data-view="week"]'); await sleep(800);
    expect(await topHour() === '08:00:00', `Month → Week opened at ${await topHour()}`);
    await p.click('.view-btn[data-view="day"]'); await sleep(800);
    expect(await topHour() === '08:00:00', `Week → Day opened at ${await topHour()}`);
    await p.evaluate(() => document.querySelector('.view-btn[data-view="day"]').click()); await sleep(800);
    expect(await topHour() === '00:00:00', `Day's next zoom step (60 min from 00:00) opened at ${await topHour()}`);
    await p.evaluate(() => document.querySelector('.view-btn[data-view="day"]').click()); await sleep(800);
    expect(await topHour() === '08:00:00', `Day's first zoom step opened at ${await topHour()}`);
    // where you scrolled to stays put through Next and a swipe
    await p.evaluate(() => { const l = document.querySelector('.fc-timegrid-slot-lane[data-time="14:00:00"]');
        const top = document.querySelector('#calendar .fc-col-header').getBoundingClientRect().bottom;
        scrollBy(0, l.getBoundingClientRect().top - top); });
    await sleep(300);
    const at = await topHour();
    expect(at >= '13:45:00' && at <= '14:00:00', `scrolling to 14:00 showed ${at}`);
    await p.evaluate(() => document.getElementById('next-btn').click()); await sleep(800);
    expect(await topHour() === at, `Next moved the hour from ${at} to ${await topHour()}`);
    await touch('touchStart', 300, 500);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', 300 - 25 * i, 500); await sleep(16); }
    await touch('touchEnd'); await sleep(900);
    expect(await topHour() === at, `a swipe moved the hour from ${at} to ${await topHour()}`);
    // a reload starts again at the start hour, not where the browser would put the page back
    await p.reload();
    await p.waitForSelector('.fc-timegrid-body');
    await sleep(1500);
    expect(await topHour() === '08:00:00', `a reload opened at ${await topHour()}`);
});
