// tw-web under a path prefix (tw-nb-interop M7 (d), 2026-11-02): a proxy can serve it at /tw/
// beside nb-web at / on one origin, with no setting, because every page names its own files and
// routes relatively. Here a made-up origin's /tw/ is routed onto the scratch server; a request
// for anything outside /tw/ would have reached the other app, so it fails the check.
// (Service workers are blocked: Playwright's routes don't see their fetches. The worker's own
// paths are covered by tests/test_relative_paths.py.)
const { check, expect, B, sleep } = require('./lib.cjs');

const P = 'http://prefix.test/tw/';

check(async pg => {
    const ctx = await pg.context().browser().newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    const escaped = [], errors = [];
    await ctx.route('http://prefix.test/**', async r => {
        const u = new URL(r.request().url());
        if (!u.pathname.startsWith('/tw/')) {
            escaped.push(u.pathname);
            return r.fulfill({ status: 404, body: 'outside the prefix' });
        }
        // the live event stream never ends, and a route can't stream it: answer it empty
        if (u.pathname === '/tw/api/events') return r.fulfill({ status: 204, body: '' });
        const resp = await r.fetch({ url: B + u.pathname.slice(3) + u.search });
        return r.fulfill({ response: resp });
    });
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(P)) errors.push(`${r.status()} ${r.url()}`); });

    for (const pg2 of ['', 'kanban.html', 'agenda.html', 'calendar-planner.html', 'help.html', 'about.html']) {
        await page.goto(P + pg2);
        await sleep(700);
    }
    // the List shows its tasks through the prefix
    await page.goto(P);
    const listed = await page.waitForSelector('.card-desc-text', { timeout: 10_000 }).then(() => true, () => false);
    expect(!escaped.length, 'requests escaped the /tw/ prefix: ' + [...new Set(escaped)].join(' '));
    expect(listed, 'the List shows no tasks under the prefix');

    // the nav bar and the page keys (K, L, ?) stay under the prefix
    await page.locator('.tw-nav-link', { hasText: 'Kanban' }).first().click();
    await page.waitForURL(P + 'kanban.html');
    await page.locator('.tw-nav-link', { hasText: 'List' }).first().click();
    await page.waitForURL(u => u.href.startsWith(P) && !u.pathname.endsWith('.html'));
    await page.waitForSelector('.card-desc-text');
    await page.keyboard.press('K');
    await page.waitForURL(P + 'kanban.html');
    await page.keyboard.press('L');
    await page.waitForURL(u => u.href.startsWith(P) && !u.pathname.endsWith('.html'));
    await page.keyboard.press('?');
    await page.waitForURL(P + 'help.html');

    await ctx.unrouteAll({ behavior: 'ignoreErrors' });
    await ctx.close();
    expect(!escaped.length, 'requests escaped the /tw/ prefix: ' + [...new Set(escaped)].join(' '));
    expect(!errors.length, 'failed under the prefix: ' + errors.slice(0, 6).join(', '));
});
