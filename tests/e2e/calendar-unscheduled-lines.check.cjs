// The Calendar's Unscheduled list in line mode: a line is as tall as on the List. calendar-planner.css
// pads every .task-card 1rem; the line rules must cancel it (561d2d2 dropped the padding: 0, and the
// lines grew a gap above and below, user 2026-11-27). A card collapsed in card mode is the same line.
const { check, expect, task, B, sleep } = require('./lib.cjs');
check(async pg => {
    task('add', 'unscheduled line probe', 'project:home', '+errand');
    await pg.setViewportSize({ width: 1280, height: 800 });
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('#unplanned-tasks .task-card');
    await sleep(1500);
    const card = pg.locator('#unplanned-tasks .task-card', { hasText: 'unscheduled line probe' });
    const look = () => card.evaluate(c => {
        const cs = getComputedStyle(c), m = c.querySelector('.card-main').getBoundingClientRect();
        const r = c.getBoundingClientRect();
        return { pad: cs.padding, spare: Math.round(r.height - m.height) };
    });
    await pg.click('#cal-view-list'); await sleep(400);
    const line = await look();
    // the borders (2px top and bottom on the Calendar) are all a line may add round its content
    expect(line.spare <= 4, `line has ${line.spare}px round its content (padding ${line.pad})`);
    await pg.click('#cal-view-card'); await sleep(400);
    await card.click({ position: { x: 40, y: 10 } }); await sleep(400);
    const collapsed = await look();
    expect(collapsed.spare <= 4, `collapsed card has ${collapsed.spare}px round its content (padding ${collapsed.pad})`);
});
