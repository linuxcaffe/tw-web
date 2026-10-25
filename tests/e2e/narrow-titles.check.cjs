// Mobile tweaks (user, 2026-10-17): at the width where the brand shortens to "Task" (nav.js
// BP.bars, 860 px), the Calendar's Day and Week titles drop the year, so both arrows fit. Each
// view's browser tab names the view: List, Kanban, Agenda, Calendar. Month names are in full on a wide
// screen and short on a narrow one, in every view (user, 2026-10-25).
const { check, expect, B, sleep } = require('./lib.cjs');
const year = String(new Date().getFullYear());
const title = pg => pg.textContent('#calendar-title');
const names = month => [...Array(12).keys()].map(m => new Date(2026, m, 1).toLocaleString('en-US', { month }))
    .filter(n => n !== 'May');   // the same both ways
const LONG = names('long'), SHORT = names('short');
async function months(pg, how) {
    const t = await title(pg);
    const words = t.split(/[^A-Za-z]+/);
    const want = how === 'long' ? LONG : SHORT, not = how === 'long' ? SHORT : LONG;
    expect(!words.some(w => not.includes(w)) && (words.some(w => want.includes(w)) || words.includes('May')),
        `${how} month names wanted: ${t}`);
}
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
    await months(pg, 'long');
    for (const v of ['day', 'month']) { await view(pg, v); await months(pg, 'long'); }
    await view(pg, 'week');

    await pg.setViewportSize({ width: 800, height: 900 });
    await sleep(500);
    expect(!(await title(pg)).includes(year), `narrow Week title: ${await title(pg)}`);
    await months(pg, 'short');
    await view(pg, 'day');
    expect(!(await title(pg)).includes(year), `narrow Day title: ${await title(pg)}`);
    await months(pg, 'short');
    await view(pg, 'month');
    expect((await title(pg)).includes(year), `narrow Month title keeps the year: ${await title(pg)}`);
    await months(pg, 'short');

    await view(pg, 'day');
    await pg.setViewportSize({ width: 1200, height: 800 });
    await sleep(500);
    expect((await title(pg)).includes(year), `wide again, Day title: ${await title(pg)}`);
});
