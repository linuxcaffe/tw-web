// Bug 19, refresh after change (djp 2026-11-04: "a refresh-after-change issue wider than nb"): a task
// changed outside this page (the CLI, another client, the phone's sync, a hook acting later)
// while the List is open. Coming back to the page must show it without a reload. Today nothing
// refetches: the visibility handler only pings the server.
const { check, expect, task, B, sleep } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    const card = () => pg.locator('.task-card', { hasText: 'epsilon work secs' });
    task('/epsilon/', 'annotate', '--', 'changed from the CLI');
    task('/epsilon/', 'modify', 'description:epsilon work secs renamed');
    // the user leaves the window and comes back
    await pg.evaluate(() => {
        for (const v of ['hidden', 'visible']) {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => v === 'hidden' });
            document.dispatchEvent(new Event('visibilitychange'));
        }
        window.dispatchEvent(new Event('focus'));
    });
    await sleep(1500);
    const text = await card().innerText();
    expect(text.includes('renamed') && text.includes('changed from the CLI'),
           `the List still shows the task as it was before a change made elsewhere: ${JSON.stringify(text)}`);
});
