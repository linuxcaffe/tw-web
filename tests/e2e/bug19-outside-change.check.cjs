// Bug 19, refresh after change (djp 2026-11-04: "a refresh-after-change issue wider than nb"): a
// task changed outside this page (the CLI, vit, another tab, the phone's sync, a hook acting
// later) while the List is open must show without a reload. Nothing refetched: the visibility
// handler only pinged the server. Now the server pushes `tasks-changed` when the data files move
// (the ping carries the same stamp, for a phone whose stream slept), and a page's own write
// doesn't reload it a second time.
const { check, expect, task, B, sleep } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    await sleep(1500);                                   // the first ping has set the page's stamp
    const card = () => pg.locator('.task-card', { hasText: 'epsilon work secs' });
    task('/epsilon/', 'annotate', '--', 'changed from the CLI');
    task('/epsilon/', 'modify', 'description:epsilon work secs renamed');
    await sleep(2500);                                   // the window never left
    const text = await card().innerText();
    expect(text.includes('renamed') && text.includes('changed from the CLI'),
           `the List still shows the task as it was before a change made elsewhere: ${JSON.stringify(text)}`);

    // The page's own write: one redraw of its own, no extra reload from the push
    let loads = 0;
    pg.on('request', r => { if (/\/api\/tasks(\?|$)/.test(r.url())) loads++; });
    await pg.locator('.task-card', { hasText: 'beta home due' }).locator('.ca-done').click();
    await sleep(3000);
    const after = loads;
    expect(after <= 1, `the page's own Done reloaded the List ${after} times (its own change came back as news)`);
});
