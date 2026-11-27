// The Calendar's Unscheduled cards keep their right edge (annotated) in either theme, as on the List.
// (No left edge there: the list holds tasks with neither due nor scheduled.) The dark theme's border-color for .tasks-column cards outranked
// them (user 2026-11-27: the edge is missing on the Calendar's pick list).
const { check, expect, task, B, sleep } = require('./lib.cjs');
check(async pg => {
    task('add', 'edge probe', 'project:home');
    task('+LATEST', 'annotate', 'a note');
    await pg.setViewportSize({ width: 1280, height: 800 });
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('#unplanned-tasks .task-card');
    await sleep(1500);
    const card = pg.locator('#unplanned-tasks .task-card', { hasText: 'edge probe' });
    const edges = () => card.evaluate(c => {
        const s = getComputedStyle(c);
        return { top: s.borderTopColor, right: s.borderRightColor };
    });
    for (const theme of ['light', 'dark']) {
        await pg.evaluate(t => t === 'dark' ? document.documentElement.setAttribute('data-theme', 'dark')
                                            : document.documentElement.removeAttribute('data-theme'), theme);
        await pg.mouse.move(0, 0); await sleep(200);
        const e = await edges();
        expect(e.right !== e.top, `${theme}: no annotation edge on the right: ${JSON.stringify(e)}`);
    }
});
