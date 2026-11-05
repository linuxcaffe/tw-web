// Before asking for an address, tw-web's way to nb-web tries nb-web's usual port where this page
// is (:5001: yoga without the bundle, or over Tailscale), after the device's and the server's
// addresses, without saving it (djp 2026-11-05). Stand-ins only.
const fs = require('fs');
const { check, expect, B, sleep } = require('./lib.cjs');

const OWN = new URL(B).protocol + '//' + new URL(B).hostname + ':5001/';

check(async pg => {
    const file = process.env.TW_WEB_SETTINGS;
    const saved = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    try {
        const s = saved ? JSON.parse(saved) : {};
        s.annotation_launchers = { ...(s.annotation_launchers || {}), nb: 'http://nb.down/#{value}' };
        fs.writeFileSync(file, JSON.stringify(s));
        await pg.route('http://nb.down/**', r => r.abort());
        await pg.route(OWN + '**', r => r.fulfill({ contentType: 'text/html', body: '<title>nb-web at its port</title>' }));

        await pg.goto(B + '/kanban.html');
        await sleep(1500);
        await pg.locator('body').click({ position: { x: 2, y: 200 } });
        await pg.keyboard.press('N');
        await pg.waitForURL(OWN, { timeout: 5000 }).catch(() => {});
        expect(pg.url() === OWN, `N went to ${pg.url()}, wanted ${OWN} with no question`);
        await pg.goBack();
        await pg.waitForURL(B + '/kanban.html');
        expect(await pg.evaluate(() => localStorage.getItem('tw-nb-web-here')) === null, 'a fallback is not saved');
    } finally {
        if (saved === null) fs.unlinkSync(file); else fs.writeFileSync(file, saved);
    }
});
