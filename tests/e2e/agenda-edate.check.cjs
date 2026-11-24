// Agenda by effective date (tw:docs/tw-web-edate-plan.md, step 3; djp 2026-11-23): each task once,
// at the earlier of scheduled and due, else wait, else until; a waiting task shows (the List hides
// it); a wait or until line says so on the card; "(overdue)" only for a past due date.
const { check, expect, B, sleep, task } = require('./lib.cjs');
const pad = n => String(n).padStart(2, '0');
const at = (days, h = 9) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:00:00`; };
const label = days => { const d = new Date(); d.setDate(d.getDate() + days);
    return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getDate()}`; };
check(async pg => {
    task('add', 'project:edate', `scheduled:${at(2)}`, `due:${at(5)}`, '--', 'e-sched-first');
    task('add', 'project:edate', `due:${at(3)}`, `scheduled:${at(6)}`, '--', 'e-due-first');
    task('add', 'project:edate', `wait:${at(4)}`, '--', 'e-waiting');
    task('add', 'project:edate', `until:${at(4, 12)}`, '--', 'e-until');
    task('add', 'project:edate', `scheduled:${at(-3)}`, '--', 'e-past-sched');
    task('add', 'project:edate', `due:${at(-2)}`, '--', 'e-past-due');
    await pg.goto(B + '/agenda.html');
    await pg.waitForSelector('.agenda-date-header');
    await pg.evaluate(() => window.twNav.setState({ project: '.is:edate' }, { clientOnly: true }));
    await sleep(1000);

    // [line text, [cards under it]]
    const days = await pg.$$eval('#tasks-container > *', els => {
        const out = [];
        for (const e of els) {
            if (e.classList.contains('agenda-date-header')) out.push([e.textContent, []]);
            else if (out.length && e.classList.contains('task-card'))
                out[out.length - 1][1].push({ d: e.querySelector('.card-desc-text')?.textContent,
                                              meta: e.querySelector('.card-meta')?.textContent || '' });
        }
        return out;
    });
    const where = desc => days.filter(([, cards]) => cards.some(c => c.d === desc)).map(([t]) => t);
    const card  = desc => days.flatMap(([, c]) => c).find(c => c.d === desc);
    const show  = JSON.stringify(days);
    for (const [desc, day] of [['e-sched-first', 2], ['e-due-first', 3], ['e-waiting', 4], ['e-until', 4],
                               ['e-past-sched', -3], ['e-past-due', -2]]) {
        const w = where(desc);
        expect(w.length === 1 && w[0].includes(label(day)), `${desc}: want once under ${label(day)}, got ${JSON.stringify(w)} in ${show}`);
    }
    expect(/wait/i.test(card('e-waiting').meta), `waiting card doesn't say wait: ${JSON.stringify(card('e-waiting'))}`);
    expect(/until/i.test(card('e-until').meta), `until card doesn't say until: ${JSON.stringify(card('e-until'))}`);
    expect(where('e-past-due')[0].includes('(overdue)'), `past due line not overdue: ${show}`);
    expect(!where('e-past-sched')[0].includes('(overdue)'), `past scheduled line says overdue: ${show}`);
    const head = await pg.textContent('#tasks-heading');
    expect(/Wait/.test(head) && /Until/.test(head), `heading: ${head}`);
});
