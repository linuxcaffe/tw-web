// The way back to nb-web (tw-nb-interop M7, djp 2026-11-03): in one window (the bundle, nb-web
// at /, tw-web at /tw/) tw-web needs a way back to nb-web other than an nb: annotation. The N key
// takes the address from tw-web's own `nb` annotation launcher, only when that's a web address,
// same tab, so Back returns. The nav link it also had opened a second nb-web instead of
// switching, so it's gone (djp 2026-11-04): no link, only the key.
// The scratch server's launcher is the default (http://localhost:5001/#{value}); that address is
// stubbed here, so the real nb-web is never touched.
const fs = require('fs');
const { check, expect, B, sleep } = require('./lib.cjs');

const NB = 'http://localhost:5001/';

check(async pg => {
    await pg.route(NB + '**', r => r.fulfill({ contentType: 'text/html', body: '<title>nb-web stand-in</title>' }));

    await pg.goto(B + '/kanban.html');
    await sleep(1500);                                  // api/config has answered
    expect(await pg.locator('#tw-nav-bar .tw-nav-sibling').count() === 0, 'the nb-web nav link is back');
    expect(await pg.locator('#tw-nav-bar a[href="' + NB + '"]').count() === 0, 'a nav link to nb-web');

    await pg.locator('body').click({ position: { x: 2, y: 200 } });
    await pg.keyboard.press('N');
    await pg.waitForURL(NB, { timeout: 5000 }).catch(() => {});
    expect(pg.url() === NB, `N went to ${pg.url()}`);
    await pg.goBack();
    await pg.waitForURL(B + '/kanban.html');           // same tab: Back comes back

    // a launcher that isn't a web address: N does nothing
    const file = process.env.TW_WEB_SETTINGS;
    const saved = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    try {
        const s = saved ? JSON.parse(saved) : {};
        s.annotation_launchers = { ...(s.annotation_launchers || {}), nb: 'nb-open {value}' };
        fs.writeFileSync(file, JSON.stringify(s));
        await pg.goto(B + '/kanban.html');
        await sleep(1500);
        await pg.locator('body').click({ position: { x: 2, y: 200 } });
        await pg.keyboard.press('N');
        await sleep(800);
        expect(pg.url() === B + '/kanban.html', `N went to ${pg.url()} with a non-web launcher`);
    } finally {
        if (saved === null) fs.unlinkSync(file); else fs.writeFileSync(file, saved);
    }
});
