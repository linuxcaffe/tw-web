// Calendar by effective date (tw:docs/tw-web-edate-plan.md, step 4; djp 2026-11-23): one event per
// task, at the earlier of scheduled and due, else wait, else until; a waiting task shows; wait is
// muted, until marked ⌛; a drag writes the field the event came from; the Unscheduled column is
// the pending tasks (waiting ones too) with neither scheduled nor due.
const { check, expect, exportOne, B, sleep, task } = require('./lib.cjs');
const pad = n => String(n).padStart(2, '0');
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const at = (n, h) => { const d = day(n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:00:00`; };
const key = n => { const d = day(n); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; };
check(async pg => {
    task('add', 'project:cedate', `due:${at(1, 9)}`, `scheduled:${at(4, 9)}`, '--', 'c-due-first');
    task('add', 'project:cedate', `scheduled:${at(1, 11)}`, `due:${at(4, 11)}`, '--', 'c-sched-first');
    task('add', 'project:cedate', `wait:${at(1, 13)}`, '--', 'c-waiting');
    task('add', 'project:cedate', `until:${at(1, 15)}`, '--', 'c-until');
    task('add', 'project:cedate', '--', 'c-none');
    await pg.goto(B + `/calendar-planner.html?date=${key(1)}&view=day`);
    await pg.waitForSelector('.fc-timegrid-event');
    await sleep(800);

    const evs = await pg.$$eval('.fc-timegrid-event', els => els.map(e => ({
        t: e.querySelector('.fc-ev-title')?.textContent || e.textContent, bg: getComputedStyle(e).backgroundColor })));
    const one = d => evs.filter(e => e.t.includes(d));
    const show = JSON.stringify(evs);
    for (const d of ['c-due-first', 'c-sched-first', 'c-waiting', 'c-until'])
        expect(one(d).length === 1, `${d}: want one event tomorrow, got ${one(d).length} in ${show}`);
    expect(one('c-due-first')[0].t.includes('⚑'), `c-due-first not a due event: ${show}`);
    expect(!one('c-sched-first')[0].t.includes('⚑'), `c-sched-first shown as due: ${show}`);
    expect(one('c-until')[0].t.includes('⌛'), `c-until not marked ⌛: ${show}`);
    const bgs = new Set(['c-due-first', 'c-sched-first', 'c-waiting', 'c-until'].map(d => one(d)[0].bg));
    expect(bgs.size === 4, `kinds not told apart by colour: ${show}`);

    // Unscheduled: neither scheduled nor due (waiting ones too)
    const side = await pg.$$eval('#unplanned-tasks .card-desc-text', els => els.map(e => e.textContent));
    for (const d of ['c-waiting', 'c-until', 'c-none'])
        expect(side.includes(d), `${d} not in Unscheduled: ${JSON.stringify(side)}`);
    for (const d of ['c-due-first', 'c-sched-first'])
        expect(!side.includes(d), `${d} in Unscheduled: ${JSON.stringify(side)}`);

    // A drag of the wait event writes wait, and nothing else
    const before = exportOne('description:c-waiting');
    const box = await pg.locator('.fc-timegrid-event', { hasText: 'c-waiting' }).boundingBox();
    await pg.mouse.move(box.x + box.width / 2, box.y + 5);
    await pg.mouse.down();
    await pg.mouse.move(box.x + box.width / 2, box.y + 80, { steps: 10 });
    await pg.mouse.up();
    await sleep(1500);
    const after = exportOne('description:c-waiting');
    expect(after.wait && after.wait !== before.wait, `wait unchanged: ${before.wait} → ${after.wait}`);
    expect(!after.scheduled && !after.due, `a wait drag wrote scheduled/due: ${JSON.stringify(after)}`);
});
