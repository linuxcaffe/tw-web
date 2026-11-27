// The List's one-line row looks the same whichever way it's reached: line mode, or a card collapsed
// by a click in card mode; and a card opened by a click in line mode looks like a card in card mode
// (user 2026-11-27: toggling one card back to a line didn't render cleanly).
const { check, expect, task, B, sleep } = require('./lib.cjs');
check(async pg => {
    task('add', 'line toggle probe with a longish description', 'project:home', 'due:tomorrow', '+errand');
    task('annotate', '1', 'an annotation');
    task('add', 'short', 'project:home', 'due:tomorrow', '+errand');
    task('add', 'a very long description that cannot possibly fit beside its pills on a phone, not even close',
         'project:home', 'due:tomorrow', '+errand');
    await pg.setViewportSize({ width: 1280, height: 800 });
    await pg.goto(B + '/');
    await pg.waitForSelector('.task-card');
    await sleep(1500);   // the list renders again once the virtual tags land (SSE: never network-idle)
    const card = pg.locator('#tasks-container .task-card', { hasText: 'line toggle probe' });
    const look = () => card.evaluate(c => {
        const r = c.getBoundingClientRect(), m = c.querySelector('.card-main'), cs = getComputedStyle(m);
        const d = getComputedStyle(c.querySelector('.card-desc'));
        return JSON.stringify({ h: Math.round(r.height), mb: getComputedStyle(c).marginBottom,
            pad: cs.padding, disp: cs.display, gap: cs.gap, font: d.fontSize,
            meta: getComputedStyle(c.querySelector('.card-meta')).justifyContent });
    });

    await pg.click('#view-card'); await sleep(400);
    const asCard = await look();
    await card.click({ position: { x: 40, y: 10 } }); await sleep(400);
    const collapsed = await look();
    await pg.click('#view-list'); await sleep(400);
    const asLine = await look();
    await card.click({ position: { x: 40, y: 10 } }); await sleep(400);
    const expanded = await look();

    expect(collapsed === asLine, `collapsed card ${collapsed} isn't the line ${asLine}`);
    expect(expanded === asCard, `opened line ${expanded} isn't the card ${asCard}`);

    // Phone width, line mode: a short description and its pills share one line; a long one takes
    // the first line alone, the pills below it, and is cut only where the line ends
    await pg.setViewportSize({ width: 400, height: 800 });
    await pg.reload();
    await pg.waitForSelector('.task-card');
    await sleep(1500);
    await pg.click('#view-list'); await sleep(400);
    const row = desc => pg.evaluate(d => {
        const c = [...document.querySelectorAll('#tasks-container .task-card')]
            .find(x => x.querySelector('.card-desc-text').textContent.startsWith(d));
        const m = c.querySelector('.card-main').getBoundingClientRect();
        const t = c.querySelector('.card-desc-text'), dr = c.querySelector('.card-desc').getBoundingClientRect();
        const mr = c.querySelector('.card-meta').getBoundingClientRect();
        return { oneLine: Math.abs(mr.top - dr.top) < 6, descW: dr.width, mainW: m.width,
                 cut: t.scrollWidth > t.clientWidth };
    }, desc);
    const short = await row('short');
    expect(short.oneLine && !short.cut, `short task: ${JSON.stringify(short)}`);
    const long = await row('a very long');
    expect(!long.oneLine && long.descW > long.mainW - 30, `long task: ${JSON.stringify(long)}`);
});
