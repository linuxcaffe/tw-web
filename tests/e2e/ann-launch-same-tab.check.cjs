// An annotation launcher link (`nb: tasknotes:x.md`) to tw-web's own origin navigates in place,
// so Back returns (tw-nb-interop M7 (d), djp 2026-11-03). In the bundle (nb-web at /, tw-web at
// /tw/, one origin) that keeps both apps in one window. It used to window.open(url, 'nb-web'):
// in an Epiphany web app that made an empty popup window ("Blank Page") and handed the URL to
// Firefox. A launcher to another origin opens a plain new tab, never a named window.
const fs = require('fs');
const { check, expect, B, sleep, task } = require('./lib.cjs');

async function withLauncher(nb, fn) {
    const file = process.env.TW_WEB_SETTINGS;
    const saved = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    try {
        const s = saved ? JSON.parse(saved) : {};
        s.annotation_launchers = { ...(s.annotation_launchers || {}), nb };
        fs.writeFileSync(file, JSON.stringify(s));
        await fn();
    } finally {
        if (saved === null) fs.unlinkSync(file); else fs.writeFileSync(file, saved);
    }
}

check(async pg => {
    task('/epsilon/', 'annotate', '--', 'nb: tasknotes:tile-order.note.md');
    const popups = [];
    pg.context().on('page', p => popups.push(p.url()));
    const link = () => pg.locator('.task-card', { hasText: 'epsilon work secs' }).locator('a.ann-launch').first();

    // same origin: in place, Back returns
    await withLauncher(B + '/about.html#{value}', async () => {
        await pg.goto(B + '/');
        await pg.waitForSelector('.card-desc-text');
        await sleep(800);                                   // launchers come from api/config
        await pg.reload(); await pg.waitForSelector('.card-desc-text'); await sleep(800);
        await link().click();
        await pg.waitForURL(u => u.pathname.endsWith('/about.html'), { timeout: 5000 }).catch(() => {});
        expect(pg.url().startsWith(B + '/about.html#tasknotes'), `stayed at ${pg.url()}`);
        expect(popups.length === 0, `opened a window: ${popups.join(' ')}`);
        await pg.goBack();
        await pg.waitForSelector('.card-desc-text');
    });

    // another origin: a plain new tab, this page untouched
    await withLauncher('http://nb.test/#{value}', async () => {
        await pg.route('http://nb.test/**', r => r.fulfill({ contentType: 'text/html', body: 'nb-web stand-in' }));
        await pg.context().route('http://nb.test/**', r => r.fulfill({ contentType: 'text/html', body: 'nb-web stand-in' }));
        await pg.goto(B + '/');
        await pg.waitForSelector('.card-desc-text'); await sleep(800);
        const before = pg.url();
        const [tab] = await Promise.all([pg.context().waitForEvent('page', { timeout: 5000 }), link().click()]);
        await tab.waitForLoadState().catch(() => {});
        expect(tab.url().startsWith('http://nb.test/#tasknotes'), `the new tab went to ${tab.url()}`);
        expect(pg.url() === before, 'the page itself navigated');
        expect(await tab.evaluate(() => window.name) === '', `a named window: "${await tab.evaluate(() => window.name)}"`);
    });
});
