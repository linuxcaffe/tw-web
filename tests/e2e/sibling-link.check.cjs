// The nb-web link (tw-nb-interop M7, djp 2026-11-03): in one window (the bundle, nb-web at /,
// tw-web at /tw/) tw-web needs a way back to nb-web other than an nb: annotation. It takes the
// address from its own `nb` annotation launcher, and only when that's a web address: a nav link
// "nb-web" and the N key, same tab, so Back returns. tw-web knows nothing else about nb-web.
// The scratch server's launcher is the default (http://localhost:5001/#{value}); that address is
// stubbed here, so the real nb-web is never touched.
const fs = require('fs');
const { check, expect, B, sleep } = require('./lib.cjs');

const NB = 'http://localhost:5001/';

check(async pg => {
    await pg.route(NB + '**', r => r.fulfill({ contentType: 'text/html', body: '<title>nb-web stand-in</title>' }));

    await pg.goto(B + '/kanban.html');
    const link = pg.locator('#tw-nav-bar .tw-nav-sibling');
    await link.waitFor({ timeout: 5000 }).catch(() => {});
    expect(await link.count() === 1, 'no nb-web link in the nav bar');
    expect(await link.innerText() === 'nb-web', `the link says "${await link.innerText()}"`);
    expect(await link.getAttribute('href') === NB, `the link goes to ${await link.getAttribute('href')}`);

    await link.click();
    await pg.waitForURL(NB);
    await pg.goBack();
    await pg.waitForURL(B + '/kanban.html');           // same tab: Back comes back

    await pg.waitForSelector('#tw-nav-bar .tw-nav-sibling');
    await pg.locator('body').click({ position: { x: 2, y: 200 } });
    await pg.keyboard.press('N');
    await pg.waitForURL(NB, { timeout: 5000 }).catch(() => {});
    expect(pg.url() === NB, `N went to ${pg.url()}`);

    // a launcher that isn't a web address: no link, no key
    const file = process.env.TW_WEB_SETTINGS;
    const saved = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    try {
        const s = saved ? JSON.parse(saved) : {};
        s.annotation_launchers = { ...(s.annotation_launchers || {}), nb: 'nb-open {value}' };
        fs.writeFileSync(file, JSON.stringify(s));
        await pg.goto(B + '/kanban.html');
        await sleep(1500);
        expect(await pg.locator('.tw-nav-sibling').count() === 0, 'a link to a launcher that is not a web address');
    } finally {
        if (saved === null) fs.unlinkSync(file); else fs.writeFileSync(file, saved);
    }
});
