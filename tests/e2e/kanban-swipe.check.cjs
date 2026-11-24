// A decided sideways swipe on the Kanban board moves to the next or previous lane, as on the Calendar
// (user 2026-11-23). A short flick, a mostly vertical swipe and a held card dragged sideways don't;
// past the last lane it springs back.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    const ctx = await pg.context().browser().newContext({ viewport: { width: 390, height: 740 }, isMobile: true,
                                                          hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent',
        { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const lane = () => p.$eval('.kb-col--focused', e => e.dataset.col);
    const shown = () => p.$$eval('.kb-col:not(.kb-col--hidden)', els => els.map(e => e.dataset.col).join());
    async function swipe(x, y, dx, dy, { hold = 0, steps = 8 } = {}) {
        await touch('touchStart', x, y);
        if (hold) await sleep(hold);
        for (let i = 1; i <= steps; i++) { await touch('touchMove', x + dx * i / steps, y + dy * i / steps); await sleep(16); }
        await touch('touchEnd');
        await sleep(600);   // the slide
    }
    await p.goto(B + '/kanban.html');
    await p.waitForSelector('.kb-col[data-col="todo"] .card-desc-text');
    const y = 400;
    expect(await lane() === 'todo', `opens on ${await lane()}`);

    await swipe(300, y, -200, 10);
    expect(await lane() === 'started' && await shown() === 'started',
        `a swipe to the left went to ${await lane()} (showing ${await shown()}), not started`);
    await swipe(100, y, 200, -10);
    expect(await lane() === 'todo' && await shown() === 'todo', `a swipe to the right went to ${await lane()}`);

    await swipe(200, y, -40, 0);
    expect(await lane() === 'todo', 'a 40 px flick changed the lane');
    await swipe(200, y, -90, 200);
    expect(await lane() === 'todo', 'a mostly vertical swipe changed the lane');

    // past the last lane: nothing to go to, and the board springs back
    await p.evaluate(() => _kbSetFocus(document.querySelectorAll('.kb-col').length - 1));
    await sleep(200);
    const last = await lane();
    await swipe(300, y, -200, 0);
    expect(await lane() === last, `a swipe past the last lane went to ${await lane()}`);
    const tf = await p.$eval('#kb-board', e => e.style.transform);
    expect(!tf, `the board stayed shifted (${tf})`);

    // a held card dragged sideways is a drag, not a swipe
    await p.evaluate(() => _kbSetFocus([...document.querySelectorAll('.kb-col')].findIndex(c => c.dataset.col === 'todo')));
    await sleep(200);
    const card = await p.$eval('.kb-col[data-col="todo"] .task-card', e => { const r = e.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 10 }; });
    await swipe(card.x, card.y, -60, 0, { hold: 400, steps: 12 });
    expect(await lane() === 'todo', `dragging a held card sideways changed the lane to ${await lane()}`);
});
