// The Sync dialog says what's coming in by station, when each station last synced and how
// automatic sync is doing; an automatic sync that brought changes reloads the view and says so;
// Settings → General has the switch. The scratch server has no gittw: the status and the event
// stream are stubbed, and nothing syncs.
const { check, expect, B, sleep } = require('./lib.cjs');
const ago = s => new Date(Date.now() - s * 1000).toISOString();
check(async pg => {
    await pg.setViewportSize({ width: 1280, height: 800 });
    let synced = 0;
    await pg.route('**/api/sync', r => { synced++; r.fulfill({ json: { success: true, output: 'ok', pulled: {} } }); });
    await pg.route('**/api/sync/status**', r => r.fulfill({ json: {
        git: true, rebase_stopped: true, changes: 1, files: [{ status: 'M', path: 'pending<b>.data' }], unpushed: 1,
        station: 'yoga', behind: 3, incoming: { s5: 3 },
        last_seen: { s5: ago(7200), yoga: ago(30) },
        auto: { enabled: true, last: Date.now() / 1000 - 600, last_ok: false, last_note: 'Could not resolve host' },
    } }));
    // One automatic sync, delivered once over the event stream
    await pg.route('**/api/events', r => r.fulfill({
        status: 200, contentType: 'text/event-stream',
        body: 'data: {"type": "synced", "pulled": {"s5": 2}}\n\n' }), { times: 1 });
    // Every toast, in order, from the start (the reloaded List's own warnings replace ours at once)
    await pg.addInitScript(() => {
        window.__toasts = [];
        document.addEventListener('DOMContentLoaded', () => new MutationObserver(() => {
            const t = document.getElementById('tw-notif-text');
            if (t && t.textContent && window.__toasts.at(-1) !== t.textContent) window.__toasts.push(t.textContent);
        }).observe(document.body, { childList: true, characterData: true, subtree: true }));
    });
    const toasts = () => pg.evaluate(() => window.__toasts.join(' | '));
    let taskLoads = 0;
    pg.on('request', q => { if (q.url().includes('/api/tasks')) taskLoads++; });
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    await sleep(1200);
    expect(/Synced: 2 changes from s5/.test(await toasts()),
           `no "Synced: 2 changes from s5" toast after an automatic sync, only: ${await toasts()}`);
    expect(taskLoads >= 2, `the List did not reload after the automatic sync (${taskLoads} loads)`);

    await pg.click('#tw-logo-btn');
    await pg.click('[data-menu="sync"]');
    await sleep(600);
    const box = await pg.locator('#tw-sync-changes').textContent();
    for (const want of ['Incoming: 3 changes from s5', 'Stations: s5 synced 2 h ago', 'yoga (this one) synced just now',
                        '1 commit here, not pushed yet', 'stopped in the middle of a rebase', 'rebase --abort', 'last try failed 10 min ago: Could not resolve host']) {
        expect(box.includes(want), `dialog lacks ${JSON.stringify(want)}: ${JSON.stringify(box)}`);
    }
    expect(await pg.locator('#tw-sync-changes b').count() === 1, 'a file name was read as HTML');
    await pg.fill('#tw-sync-comment', 'from the check');
    await pg.click('#tw-sync-now');
    await sleep(400);
    expect(synced === 1, `Sync Now posted ${synced} times`);
    await pg.click('#tw-sync-close');

    await pg.click('#tw-logo-btn');
    await pg.click('[data-menu="settings"]');
    await pg.waitForSelector('.tws-section-hdr');
    await sleep(400);
    if (!(await pg.locator('#tws-sync-auto').isVisible())) await pg.locator('.tws-section-hdr', { hasText: 'General' }).click();
    expect(await pg.locator('#tws-sync-auto').isChecked(), 'Sync automatically is not on by default');
    await pg.locator('#tws-sync-auto').uncheck();
    await pg.click('button[type=submit]:has-text("Save")');
    await sleep(600);
    const cfg = await pg.evaluate(() => fetch('/api/config').then(r => r.json()));
    expect(cfg.sync_auto === false, `sync_auto after unchecking and saving: ${cfg.sync_auto}`);
});
