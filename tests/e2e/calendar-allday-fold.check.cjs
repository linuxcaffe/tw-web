// The all-day row in Week and Day (user 2026-11-27): its "all-day"
// label folds it away, remembered on reload; a day whose all-day events are out of sight (folded, or
// scrolled under the sticky day names on a phone) says "N all-day" in its header, the tooltip names
// them, and a click unfolds the row into view. The "earlier" marker's tooltip names what it hides,
// and Month's "+N more" names its hidden events instead of "Show N more events".
const { check, expect, task, B, sleep } = require('./lib.cjs');
check(async pg => {
    task('add', 'allday probe', 'due:today');
    task('add', 'second probe', 'due:today');
    task('add', 'early probe', 'due:today+1h');
    const count = pg.locator('#calendar .fc-col-header-cell.fc-day-today .cal-allday-count');
    const rowH  = () => pg.evaluate(() => document.querySelector('#calendar .fc-daygrid-body').getBoundingClientRect().height);

    // wide Week: row tight, no count while it's in view
    await pg.setViewportSize({ width: 1280, height: 720 });
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-ev-title');
    await pg.click('.view-btn[data-view="week"]');
    await sleep(700);
    const open = await rowH();
    expect(await count.count() === 0, 'a header count with the row in view');
    const up = pg.locator('#cal-marker-up');
    if (await up.isVisible()) {
        const t = await up.getAttribute('title');
        expect(t.includes('early probe'), `"earlier" tooltip "${t}" doesn't name the event`);
    }

    // fold: the row shrinks, today's header counts its two, the tooltip names them
    await pg.click('#calendar .fc-daygrid-body .fc-timegrid-axis');
    await sleep(400);
    const folded = await rowH();
    expect(folded < open - 10, `folded row is ${folded}px (open ${open}px)`);
    expect((await count.textContent()).trim() === '2 all-day', `count says "${await count.textContent()}"`);
    const title = await count.getAttribute('title');
    expect(title.includes('allday probe') && title.includes('second probe'), `count tooltip "${title}"`);

    // remembered on reload; the count unfolds it
    await pg.reload();
    await pg.waitForSelector('.fc-ev-title', { state: 'attached' });   // folded: hidden
    await sleep(700);
    expect(await count.count() === 1, 'the fold was not remembered');
    await count.click();
    await sleep(400);
    expect(await rowH() >= open - 2, 'clicking the count did not unfold the row');
    expect(await count.count() === 0, 'the count is still shown with the row open');

    // phone Day: the row scrolled away under the day names gets the count; a click brings it back
    await pg.setViewportSize({ width: 400, height: 700 });
    await pg.click('.view-btn[data-view="day"]');
    await sleep(700);
    await pg.evaluate(() => window.scrollTo(0, 0));
    await sleep(200);
    const rowY = await pg.evaluate(() => document.querySelector('#calendar .fc-daygrid-body').getBoundingClientRect().bottom);
    await pg.evaluate(y => window.scrollBy(0, y + 200), rowY);
    await sleep(500);
    expect(await count.count() === 1, 'no header count with the row scrolled away');
    await count.click();
    await sleep(500);
    const shown = await pg.evaluate(() => {
        const r = document.querySelector('#calendar .fc-daygrid-body').getBoundingClientRect();
        const h = document.querySelector('#calendar .fc-col-header').getBoundingClientRect().bottom;
        return r.top >= h - 3 && r.top < window.innerHeight;
    });
    expect(shown, 'clicking the count did not bring the all-day row back');

    // Month: "+N more" names what it hides
    for (let i = 1; i <= 6; i++) task('add', `crowd ${i}`, 'due:today');
    await pg.setViewportSize({ width: 1280, height: 720 });
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-ev-title');
    await pg.click('.view-btn[data-view="month"]');
    await sleep(800);
    const more = pg.locator('.fc-daygrid-day.fc-day-today .fc-daygrid-more-link');
    expect(await more.count() > 0, 'no "+N more" link on a crowded day');
    await more.first().hover();
    await sleep(200);
    const mt = await more.first().getAttribute('title');
    expect(/crowd \d|probe/.test(mt || '') && !/^Show/.test(mt), `"+N more" tooltip is "${mt}"`);
});
