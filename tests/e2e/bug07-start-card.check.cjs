// Bug 7: Start on the List must flip the card to its started state.
const { check, expect, B, sleep, exportOne } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    await pg.locator('.task-card', { hasText: 'gamma home sched' }).locator('.ca-start').click();
    await sleep(1500);
    if (!exportOne('3').start) throw new Error('the start itself failed');
    const card = pg.locator('.task-card', { hasText: 'gamma home sched' });
    expect(await card.locator('.ca-stop').isVisible(), 'card still offers Start, not Stop');
    expect(await card.evaluate(e => e.classList.contains('task-started')), 'card lacks the started style');
});
