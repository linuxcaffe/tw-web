// Agenda date lines (user, 2026-10-17): centred so they don't compete with the cards; only the
// "(overdue)" part is red; there's always a TODAY bar, in date order, and when nothing shown is
// due or scheduled today it's followed by "Nothing due or scheduled".
const { check, expect, B, sleep, task } = require('./lib.cjs');
const headers = pg => pg.$$eval('#tasks-container > .agenda-date-header, #tasks-container > .agenda-nothing',
    els => els.map(e => ({ cls: e.className, text: e.textContent, align: getComputedStyle(e).textAlign,
                           color: getComputedStyle(e).color,
                           red: [...e.querySelectorAll('.agenda-overdue')].map(s =>
                                ({ text: s.textContent, color: getComputedStyle(s).color })) })));
const setNav = (pg, s) => pg.evaluate(s => window.twNav.setState(s, { clientOnly: true }), s);
check(async pg => {
    task('add', 'kappa late', 'project:late', 'due:yesterday');
    await pg.goto(B + '/agenda.html');
    await pg.waitForSelector('.agenda-date-header');
    await sleep(500);

    let h = await headers(pg);
    const late = h.find(x => x.text.includes('(overdue)'));
    expect(late, `no overdue line: ${JSON.stringify(h)}`);
    expect(late.align === 'center', `date line not centred: ${late.align}`);
    expect(late.red.length === 1 && late.red[0].text === '(overdue)', `red part: ${JSON.stringify(late.red)}`);
    expect(late.red[0].color !== late.color, `"(overdue)" not set apart: ${late.red[0].color} vs ${late.color}`);
    expect(!/(220|183), (53|28)/.test(late.color), `whole overdue line is red: ${late.color}`);
    const order = h.map(x => x.cls.includes('today') ? 'T' : x.text.includes('(overdue)') ? 'O' : 'D');
    expect(order.join('') .startsWith('OT'), `order: ${order.join('')}`);

    // Days are local days: beta and omega are due tonight (20:00, 21:00), which is already
    // tomorrow in UTC west of Greenwich (they showed under TOMORROW). Lines and cards in order:
    const seq = await pg.$$eval('#tasks-container > *', els => els.map(e =>
        e.classList.contains('agenda-date-header') ? (e.classList.contains('today') ? 'TODAY' : 'DATE')
        : (e.querySelector('.card-desc-text')?.textContent || '')));
    const todayAt = seq.indexOf('TODAY');
    const nextAt  = seq.indexOf('DATE', todayAt);
    const todays  = seq.slice(todayAt + 1, nextAt === -1 ? undefined : nextAt);
    expect(todays.includes('beta home due') && todays.includes('omega home due'),
           `tonight's tasks not under TODAY: ${JSON.stringify(seq)}`);

    // Nothing today in view: the TODAY bar stays, in date order, with the "nothing" line
    await setNav(pg, { project: '.is:work' });       // epsilon only, due 2030
    await sleep(800);
    h = await headers(pg);
    expect(h.length === 3 && h[0].cls.includes('today') && h[1].cls.includes('agenda-nothing')
           && h[1].text === 'Nothing due or scheduled' && h[2].text.includes('2030'),
           `work: ${JSON.stringify(h.map(x => x.text))}`);

    await setNav(pg, { project: '.is:late' });       // overdue only: TODAY comes after it
    await sleep(800);
    h = await headers(pg);
    expect(h.length === 3 && h[0].text.includes('(overdue)') && h[1].cls.includes('today')
           && h[2].cls.includes('agenda-nothing'), `late: ${JSON.stringify(h.map(x => x.text))}`);

    await setNav(pg, { project: '.is:nosuch' });     // nothing at all: still a TODAY bar
    await sleep(800);
    h = await headers(pg);
    expect(h.length === 2 && h[0].cls.includes('today') && h[1].cls.includes('agenda-nothing'),
           `nothing: ${JSON.stringify(h.map(x => x.text))}`);
});
