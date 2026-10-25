// The service worker asks the server first and falls back to its cache only when the server doesn't
// answer (user 2026-10-24: after a day of updates the PWA ran a stale mix of files, and only
// tw-web-launch.sh --clean cured it). A file fetched by a controlled page is the server's own, not the
// copy cached at install; with the network gone the page still loads from the cache.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/');
    await pg.evaluate(() => navigator.serviceWorker.ready);
    await pg.reload();                                   // now the worker controls the page
    await pg.waitForFunction(() => navigator.serviceWorker.controller);
    await sleep(2500);                                   // anything cached at install is now 2.5 s old
    const age = await pg.evaluate(async () => {
        const r = await fetch('/styles.css');
        return (Date.now() - Date.parse(r.headers.get('date').slice(0, 29))) / 1000;   // Werkzeug sends Date twice
    });
    expect(age < 2, `a controlled page got /styles.css from the cache (${age.toFixed(1)} s old), not the server`);
    await pg.context().setOffline(true);
    try {
        await pg.reload();
        await pg.waitForSelector('#tw-nav-bar', { timeout: 5000 });
    } catch (e) {
        expect(false, `offline, the page didn't load from the cache: ${e.message.split('\n')[0]}`);
    } finally {
        await pg.context().setOffline(false);
    }
});
