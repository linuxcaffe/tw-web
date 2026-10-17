// Mobile tweaks (user, 2026-10-17): at the width where the brand shortens to "Task" (nav.js
// BREAK, 860 px), the Calendar's Day and Week titles drop the year, so both arrows fit. Each
// view's browser tab names the view: List, Kanban, Agenda, Calendar.
const { check, expect, B, sleep } = require('./lib.cjs');
const year = String(new Date().getFullYear());
const title = pg => pg.textContent('#calendar-title');
async function view(pg, v) { await pg.click(`.view-btn[data-view="${v}"]`); await sleep(400); }
check(async pg => {
    for (const [path, name] of [['/', 'List'], ['/kanban.html', 'Kanban'],
                                ['/agenda.html', 'Agenda'], ['/calendar-planner.html', 'Calendar']]) {
        await pg.goto(B + path);
        const t = await pg.title();
        expect(t === name, `${path} tab title: ${JSON.stringify(t)}, want ${name}`);
    }

    await pg.setViewportSize({ width: 1200, height: 800 });
    await pg.waitForSelector('#calendar-title');
    await view(pg, 'week');
    expect((await title(pg)).includes(year), `wide Week title lost the year: ${await title(pg)}`);

    await pg.setViewportSize({ width: 800, height: 900 });
    await sleep(500);
    expect(!(await title(pg)).includes(year), `narrow Week title: ${await title(pg)}`);
    await view(pg, 'day');
    expect(!(await title(pg)).includes(year), `narrow Day title: ${await title(pg)}`);
    await view(pg, 'month');
    expect((await title(pg)).includes(year), `narrow Month title keeps the year: ${await title(pg)}`);

    await view(pg, 'day');
    await pg.setViewportSize({ width: 1200, height: 800 });
    await sleep(500);
    expect((await title(pg)).includes(year), `wide again, Day title: ${await title(pg)}`);
});
