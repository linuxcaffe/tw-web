// The helmet spinner (twNav.spinner) shows wherever a view or dialog waits on the server with
// nothing to show yet, and is gone (removed, not just hidden) once the answer lands. Each wait is
// made long by holding the server's answers to a pattern until the check releases them.
const { check, expect, B, sleep } = require('./lib.cjs');

check(async pg => {
    await pg.setViewportSize({ width: 1280, height: 800 });

    // Hold every request matching `pattern` until release(); answers then pass through untouched
    async function hold(pattern) {
        let open;
        const gate = new Promise(r => { open = r; });
        const handler = async route => { await gate; route.continue().catch(() => {}); };
        await pg.route(pattern, handler);
        return async () => { open(); await sleep(50); await pg.unroute(pattern, handler); };
    }
    const shown = sel => pg.locator(sel + ' .tw-spinner').first().isVisible().catch(() => false);
    const count = sel => pg.locator(sel + ' .tw-spinner').count();
    // A fresh page with nothing cached: every view reads its tasks from the server
    async function fresh(url) {
        await pg.goto(B + '/about.html');
        await pg.evaluate(() => sessionStorage.clear());
        await pg.goto(B + url, { waitUntil: 'domcontentloaded' });
    }

    // List
    let release = await hold('**/api/tasks?*');
    await fresh('/');
    await sleep(400);
    expect(await shown('#loading'), 'List: no spinner while its tasks load');
    await release();
    await pg.waitForSelector('.card-desc-text');
    expect(!(await shown('#loading')), 'List: spinner still shown after the tasks came');

    // Agenda
    release = await hold('**/api/tasks/dated?*');
    await fresh('/agenda.html');
    await sleep(400);
    expect(await shown('#loading'), 'Agenda: no spinner while its tasks load');
    await release();
    await sleep(800);
    expect(!(await shown('#loading')), 'Agenda: spinner still shown after the tasks came');

    // Calendar: the grid and the Unscheduled column
    release = await hold('**/api/tasks*');
    await fresh('/calendar-planner.html');
    await sleep(600);
    expect(await shown('#unplanned-tasks'), 'Calendar: no spinner in Unscheduled while it loads');
    expect(!(await pg.locator('#unplanned-tasks').textContent()).includes('⏳'), 'Calendar: the hourglass is back');
    expect(await shown('#cal-loading'), 'Calendar: no spinner over the grid while it loads');
    await release();
    await pg.waitForSelector('.fc-ev-title');
    await sleep(300);
    expect(await count('#unplanned-tasks') === 0, 'Calendar: spinner left in Unscheduled');
    expect(await count('#cal-loading') === 0, 'Calendar: spinner left over the grid');

    // Kanban
    release = await hold('**/api/tasks?*');
    await fresh('/kanban.html');
    await sleep(600);
    expect(await shown('#kb-board'), 'Kanban: no spinner while the board loads');
    await release();
    await pg.waitForSelector('.kb-col', { state: 'attached' });
    expect(await count('#kb-board') === 0, 'Kanban: spinner left on the board');

    // Help: a page that takes its time
    release = await hold('**/api/help/page/**');
    await fresh('/help.html');
    await sleep(600);
    expect(await shown('#help-page'), 'Help: no spinner while a page loads');
    await release();
    await pg.waitForSelector('#help-page .help-md h1');
    expect(await count('#help-page') === 0, 'Help: spinner left on the page');

    // A side-menu panel (Projects)
    await pg.goto(B + '/about.html');   // not '/': it resumes the last view
    await sleep(500);
    release = await hold('**/api/projects*');
    await pg.evaluate(() => { document.getElementById('tw-side-menu').classList.add('open'); });
    await pg.locator('#tw-menu-list .tw-menu-item', { hasText: 'Projects' }).first().click();
    await sleep(400);
    expect(await shown('#tw-panel-body'), 'Projects panel: no spinner while it loads');
    await release();
    await sleep(500);
    expect(await count('#tw-panel-body') === 0, 'Projects panel: spinner left after it loaded');

    // Sync dialog: the remote check, and Sync Now
    await pg.keyboard.press('Escape');
    release = await hold('**/api/sync/status?fetch=1');
    await pg.evaluate(() => window.twNav.openSyncDialog());
    await sleep(400);
    expect(await shown('#tw-sync-changes'), 'Sync: no spinner while it checks the remote');
    await release();
    await sleep(500);
    expect(await count('#tw-sync-changes') === 0, 'Sync: spinner left after the check');
});
