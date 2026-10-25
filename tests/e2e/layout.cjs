// The layout shots (tw:docs/tw-web-layout-plan.md, step 0), run as layout-shots-100 and layout-shots-133:
// one zoom per check, because both in one came within run.py's 120 s. Each page at 1280, 840 (between the
// 800 and 860 breakpoints), 780 (between 768 and 800) and a phone's width, at the top and after a mouse-wheel
// scroll. 133% is browser zoom (a CSS viewport of width/1.33 at a pixel ratio of 1.33): the PWA ran at
// 133% for weeks. Always: the sticky nav bar stays at the top and the page never scrolls sideways. With
// TW_E2E_SHOTS=<dir> it also saves a screenshot of each, so a change that should leave the layout alone
// can be compared before and after: .tools/compare-shots.sh <before> <after>. The clock is frozen
// (tomorrow 10:00), so the now-line and "today" don't move between the two runs.
const fs = require('fs');
const { check, expect, task, B, sleep } = require('./lib.cjs');
const SHOTS = process.env.TW_E2E_SHOTS || '';

// the same pixels twice: transitions finished, and the scratch server's notice (its random taskrc path) hidden
const SHOT = { animations: 'disabled', style: '#tw-notification { visibility: hidden !important; }' };
const PAGES = [
    ['list',     '/'],
    ['agenda',   '/agenda.html'],
    ['kanban',   '/kanban.html'],
    ['month',    '/calendar-planner.html?view=month'],
    ['week',     '/calendar-planner.html?view=week'],
    ['day',      '/calendar-planner.html?view=day'],
];

// The working minimum (user, 2026-10-25): the status pill row's width at 133%, 358 CSS px (338 for the pills,
// 20 for the bar's padding). The phone shot is 390 wide, or the minimum where zoom would take it below:
// a 390 window at 133% is 293 CSS px, narrower than tw-web has to fit.
const MIN_CSS = 358;
const sizes = zoom => [[1280, 800], [840, 800], [780, 800], [Math.max(390, Math.ceil(MIN_CSS * zoom)), 844]];

module.exports = zoom => check(async pg => {
    // urgency without its due and age terms: they follow the server's clock, and a card's "urgency:8.2"
    // turned 8.3 between two runs; the scratch taskrc gets them back afterwards
    const rc = process.env.TASKRC, rcBefore = fs.readFileSync(rc, 'utf8');
    fs.writeFileSync(rc, rcBefore + 'urgency.due.coefficient=0\nurgency.age.coefficient=0\n');
    try { await shots(pg, zoom); } finally { fs.writeFileSync(rc, rcBefore); }
});

async function shots(pg, zoom) {
    // enough tasks for List and Agenda to scroll
    for (let i = 0; i < 30; i++)
        task('add', `layout filler ${String(i).padStart(2, '0')}`, `project:${i % 2 ? 'work' : 'home'}`, `due:today+${i}d`);
    const now = new Date(); now.setDate(now.getDate() + 1); now.setHours(10, 0, 0, 0);
    const browser = pg.context().browser();
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const problems = [];
    for (const [w, h] of sizes(zoom)) {
        const ctx = await browser.newContext({ viewport: { width: Math.round(w / zoom), height: Math.round(h / zoom) },
                                               deviceScaleFactor: zoom });
        await ctx.clock.setFixedTime(now);
        const p = await ctx.newPage();
        for (const [name, url] of PAGES) {
            await p.goto(B + url);
            await p.waitForSelector('#tw-nav-bar');
            await sleep(1200);  // tasks load, the Calendar scrolls to its start hour (an open event stream: never network-idle)
            const tag = `${name}-${w}-${Math.round(zoom * 100)}`;
            await p.mouse.move(0, Math.round(h / zoom) - 1);   // no hover where the last page's wheel was
            if (SHOTS) await p.screenshot({ path: `${SHOTS}/${tag}-top.png`, ...SHOT });
            await p.mouse.move(Math.round(w / zoom / 2), Math.round(h / zoom / 2));
            await p.mouse.wheel(0, 400);
            await sleep(500);
            await p.mouse.move(0, Math.round(h / zoom) - 1);
            if (SHOTS) await p.screenshot({ path: `${SHOTS}/${tag}-wheel.png`, ...SHOT });
            const g = await p.evaluate(() => ({
                nav: document.getElementById('tw-nav-bar').getBoundingClientRect().top,
                sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            }));
            if (Math.abs(g.nav) > 0.5) problems.push(`${tag}: nav bar at ${g.nav}px after the wheel`);
            if (g.sideways > 0) problems.push(`${tag}: page scrolls ${g.sideways}px sideways`);
        }
        await ctx.close();
    }
    expect(!problems.length, problems.join('; '));
}
