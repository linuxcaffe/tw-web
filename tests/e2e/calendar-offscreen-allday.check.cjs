// Where the page scrolls (phone layout), the all-day row scrolls away under the sticky headers.
// A marker "↑ N all-day" then says so, its tooltip names the events, and a click brings the row back.
// The "earlier" marker's tooltip names what it hides too, and Month's "+N more" names its hidden
// events instead of FullCalendar's "Show N more events" (user 2026-11-27).
const { check, expect, task, B, sleep } = require('./lib.cjs');
check(async pg => {
    task('add', 'allday probe', 'due:today');
    task('add', 'early probe', 'due:today+1h');
    for (let i = 1; i <= 6; i++) task('add', `crowd ${i}`, 'due:today');
    await pg.setViewportSize({ width: 400, height: 700 });
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-ev-title');
    await pg.click('.view-btn[data-view="day"]');
    await sleep(800);

    // scroll the all-day row away under the headers
    await pg.evaluate(() => window.scrollTo(0, 0));
    await sleep(200);
    const rowY = await pg.evaluate(() => document.querySelector('#calendar .fc-daygrid-body').getBoundingClientRect().bottom);
    await pg.evaluate(y => window.scrollBy(0, y + 200), rowY);
    await sleep(500);
    const all = pg.locator('#cal-marker-allday');
    expect(await all.isVisible(), 'no "all-day" marker with the all-day row scrolled away');
    const text = (await all.textContent()).trim();
    expect(/↑ \d+ all-day/.test(text), `marker says "${text}"`);
    const title = await all.getAttribute('title');
    expect(title.includes('allday probe'), `all-day tooltip "${title}" doesn't name the event`);
    await all.click();
    await sleep(500);
    const shown = await pg.evaluate(() => {
        const r = document.querySelector('#calendar .fc-daygrid-body').getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight;
    });
    expect(shown, 'clicking the marker did not bring the all-day row back');
    expect(!(await all.isVisible()), 'the "all-day" marker is still shown with the row in view');

    // the earlier marker's tooltip
    const up = pg.locator('#cal-marker-up');
    if (await up.isVisible()) {
        const t = await up.getAttribute('title');
        expect(t.includes('early probe'), `"earlier" tooltip "${t}" doesn't name the event`);
    }

    // Month: "+N more" names what it hides
    await pg.setViewportSize({ width: 1280, height: 720 });
    await pg.click('.view-btn[data-view="month"]');
    await sleep(800);
    const more = pg.locator('.fc-daygrid-day.fc-day-today .fc-daygrid-more-link');
    expect(await more.count() > 0, 'no "+N more" link on a crowded day');
    await more.first().hover();
    await sleep(200);
    const mt = await more.first().getAttribute('title');
    expect(/crowd \d|probe/.test(mt || '') && !/^Show/.test(mt), `"+N more" tooltip is "${mt}"`);
    expect(!(await all.isVisible()), 'the "all-day" marker shown in Month');
});
