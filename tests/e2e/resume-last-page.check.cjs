// tw-web opened at its bare address from outside (a launcher, nb-web's W key) goes back to the
// page open last time: Kanban, Agenda, Calendar or List (djp 2026-11-05: "when switching back and
// forth between webapps, I always land at the same starting point"). Its own List link still
// goes to the List.
const { check, expect, B, sleep } = require('./lib.cjs');

check(async pg => {
    await pg.goto(B + '/kanban.html');
    await sleep(500);
    await pg.goto('about:blank');
    await pg.goto(B + '/');                                    // a launcher: no referrer
    await pg.waitForURL(/kanban\.html$/, { timeout: 5000 }).catch(() => {});
    expect(/kanban\.html$/.test(pg.url()), `a bare load landed on ${pg.url()}, wanted kanban.html`);

    await pg.locator('.tw-nav-link', { hasText: 'List' }).first().click();   // tw-web's own link
    await pg.waitForLoadState('load');
    await sleep(800);
    expect(!/kanban\.html/.test(pg.url()), `List link went to ${pg.url()}`);

    await pg.goto(B + '/agenda.html');
    await sleep(500);
    await pg.goto(B + '/', { referer: 'http://localhost:5080/' });   // nb-web's W, in the bundle
    await pg.waitForURL(/agenda\.html$/, { timeout: 5000 }).catch(() => {});
    expect(/agenda\.html$/.test(pg.url()), `from nb-web landed on ${pg.url()}, wanted agenda.html`);
});
