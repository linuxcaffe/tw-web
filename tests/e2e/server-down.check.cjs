// A server that stops answering gets a banner, not "Network error: Failed to fetch" (s5, 2026-10-22):
// a write that finds no one says so, the banner says when the server was last reached, and goes
// away (with the view reloaded) when it answers again. Settings → Server restarts it. Nothing here
// stops or restarts the scratch server: "no answer" is faked by aborting requests, and the restart
// route is stubbed.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    await pg.setViewportSize({ width: 1280, height: 800 });
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    await sleep(500);                                       // the first ping has answered
    const banner = pg.locator('#tw-server-banner');
    // Every toast, in order: a later one (the reloaded view's warnings) can replace ours at once
    await pg.evaluate(() => {
        window.__toasts = [];
        new MutationObserver(() => window.__toasts.push(document.getElementById('tw-notif-text').textContent))
            .observe(document.getElementById('tw-notif-text'), { childList: true, characterData: true, subtree: true });
    });
    const toasts = () => pg.evaluate(() => window.__toasts.join(' | '));
    expect(!(await banner.isVisible()), 'banner shown while the server answers');

    // The server "stops": every request goes unanswered
    await pg.route('**/api/**', r => r.abort('connectionrefused'));
    await pg.locator('.task-card', { hasText: 'beta home due' }).locator('.ca-done').click();
    await sleep(800);
    const said = await pg.locator('#tw-cmd-output').textContent();
    expect(/isn't answering/.test(said) && !/Failed to fetch/.test(said),
           `a write with no answer said: ${JSON.stringify(said)}`);
    expect(await banner.isVisible(), 'no banner after a write found no server');
    const text = await banner.locator('.tw-sb-text').textContent();
    expect(/isn't answering \(last reached \d{1,2}:\d{2}/.test(text), `banner text: ${JSON.stringify(text)}`);
    expect(!(await banner.locator('.tw-sb-start').isVisible()), '"Open Termux" shown off Termux');

    // It's back: Retry clears the banner and reloads the view
    await pg.unroute('**/api/**');
    await banner.locator('.tw-sb-retry').click();
    await sleep(800);
    expect(!(await banner.isVisible()), 'banner still shown after the server answered again');
    expect(/Server is back/.test(await toasts()), `no "Server is back" among: ${await toasts()}`);

    // On a phone (the ping said termux), the banner offers to open Termux
    await pg.route('**/api/ping', r => r.fulfill({ json: { ok: true, termux: true, started: 0 } }));
    await pg.evaluate(() => document.dispatchEvent(new CustomEvent('tw-server-check')));
    await sleep(300);
    await pg.unroute('**/api/ping');
    await pg.route('**/api/ping', r => r.abort('connectionrefused'));
    await pg.evaluate(() => document.dispatchEvent(new CustomEvent('tw-server-check')));
    await sleep(500);
    const start = banner.locator('.tw-sb-start');
    expect(await start.isVisible(), 'no "Open Termux" on a phone');
    expect((await start.getAttribute('href')).startsWith('intent:#Intent;') &&
           (await start.getAttribute('href')).includes('package=com.termux'), 'Open Termux is not a Termux intent');
    await pg.unroute('**/api/ping');
    await banner.locator('.tw-sb-retry').click();
    await sleep(500);

    // Settings → Server → Restart: the banner says so, then "Server restarted"
    let restarted = 0;
    await pg.route('**/api/server/restart', r => { restarted++; r.fulfill({ json: { success: true } }); });
    await pg.route('**/api/server/stop', r => { throw new Error('the check must never stop the server'); });
    await pg.click('#tw-logo-btn');
    await pg.click('[data-menu="settings"]');
    await pg.waitForSelector('.tws-section-hdr');
    await sleep(400);
    const hdr = pg.locator('.tws-section-hdr', { hasText: 'Server' });
    const btn = pg.locator('button', { hasText: 'Restart server' });
    if (!(await btn.isVisible())) await hdr.click();
    expect(/Running since/.test(await pg.locator('.tws-section', { hasText: 'Restart server' }).textContent()),
           'no "Running since" in Settings → Server');
    await btn.click();
    await sleep(200);
    expect(restarted === 1, `restart posted ${restarted} times`);
    expect(/Restarting/.test(await banner.locator('.tw-sb-text').textContent()), 'banner does not say Restarting');
    await sleep(2200);                                      // the page checks again after 1.5 s
    expect(!(await banner.isVisible()), 'banner still shown after the restart answered');
    expect(/Server restarted/.test(await toasts()), `no "Server restarted" among: ${await toasts()}`);
});
