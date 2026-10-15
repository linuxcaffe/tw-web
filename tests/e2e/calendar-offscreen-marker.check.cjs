// Week and Day open at cal_scroll_time, so an event before it is scrolled out of view. A marker
// at the top of the grid says "↑ N earlier"; clicking it scrolls to the event, and the marker
// goes away. Events after the visible hours get "↓ N later".
const { check, expect, task, B, sleep } = require('./lib.cjs');
check(async pg => {
    task('add', 'early probe', 'due:today+1h');
    await pg.setViewportSize({ width: 1280, height: 720 });
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-ev-title');
    await sleep(800);
    const up = pg.locator('#cal-marker-up');
    expect(await up.isVisible(), 'no "earlier" marker with a 01:00 event above the view');
    const text = (await up.textContent()).trim();
    expect(/1 earlier/.test(text), `marker says "${text}"`);
    await up.click();
    await sleep(600);
    const inView = await pg.evaluate(() => {
        const sc = document.querySelector('.fc-timegrid-body').closest('.fc-scroller').getBoundingClientRect();
        const ev = [...document.querySelectorAll('.fc-timegrid-event')]
            .find(e => e.textContent.includes('early probe')).getBoundingClientRect();
        return ev.bottom > sc.top && ev.top < sc.bottom;
    });
    expect(inView, 'clicking the marker did not bring the event into view');
    expect(!(await up.isVisible()), 'the "earlier" marker is still shown with nothing above');
    await pg.click('.view-btn[data-view="month"]');
    await sleep(400);
    expect(!(await up.isVisible()) && !(await pg.locator('#cal-marker-down').isVisible()),
           'markers shown in Month');
});
