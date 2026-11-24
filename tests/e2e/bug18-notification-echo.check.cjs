// Bug 18 (2026-11-03): main.js listened to tw-show-notification and answered with
// showNotification, which dispatches tw-show-notification again: every toast on the List
// echoed until the stack overflowed (43 events for one "No changes"; the two "Maximum call
// stack size exceeded" page errors on every List load). nav.js draws the toast; one message,
// one event.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    const errors = [];
    pg.on('pageerror', e => errors.push(e.message));
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    await sleep(1000);
    // Count only this save's message: another toast can land in the window (the server's
    // events, the List's warnings), and the echo was always of the same message
    await pg.evaluate(() => { window._n = 0; window._all = [];
        document.addEventListener('tw-show-notification', e => {
            window._all.push(e.detail?.message);
            if (e.detail?.message === 'No changes') window._n++;
        }); });
    await pg.locator('.task-card', { hasText: 'epsilon work secs' }).locator('.ca-edit').click();
    await pg.waitForSelector('#task-editor-save', { state: 'visible' });
    await sleep(300);
    await pg.click('#task-editor-save');            // nothing changed: one "No changes"
    await sleep(800);
    const n = await pg.evaluate(() => window._n);
    expect(n === 1, `one "No changes" became ${n} events (all: ${JSON.stringify(await pg.evaluate(() => window._all))})`);
    expect(!errors.some(e => /call stack/i.test(e)), 'page errors: ' + errors.join(' | '));
    expect(await pg.locator('#tw-notif-text').innerText() === 'No changes', 'the toast did not show the message');
});
