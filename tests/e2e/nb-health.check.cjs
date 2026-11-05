// tw-nb-interop M7 (a), tw-web's side (djp 2026-11-04): TW.nbHealth() is one answer to "what of
// nb is here?": the server's parts (/api/nb/health, test_nb_health.py) plus nb-web's
// reachability, probed from the browser, since the `nb` launcher is the browser's address. A
// launcher to a live origin is up; to nothing, down within a second; not a web address, unset.
const fs = require('fs');
const { check, expect, B, sleep } = require('./lib.cjs');

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

const ask = pg => pg.evaluate(() => TW.nbHealth({ fresh: true }));

check(async pg => {
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');

    await withLauncher(B + '/about.html#{value}', async () => {     // this origin: answers
        const h = await ask(pg);
        expect(h.nbWeb.state === 'up', `same origin: ${JSON.stringify(h.nbWeb)}`);
        expect(h.nbWeb.url === B + '/about.html', `url ${h.nbWeb.url}`);
        expect(typeof h.nb.ok === 'boolean' && typeof h.plugin.ok === 'boolean', 'server parts');
    });

    await withLauncher('http://nb.test/#{value}', async () => {        // another origin that answers
        await pg.context().route('http://nb.test/**', r => r.fulfill({ contentType: 'text/html', body: 'nb-web' }));
        const h = await ask(pg);
        expect(h.nbWeb.state === 'up', `another origin, answering: ${h.nbWeb.state}`);
    });

    await withLauncher('http://127.0.0.1:9/#{value}', async () => {    // nothing listens
        const t0 = Date.now();
        const h = await ask(pg);
        expect(h.nbWeb.state === 'down', `closed port: ${h.nbWeb.state}`);
        expect(Date.now() - t0 < 2500, `took ${Date.now() - t0} ms`);
    });

    await withLauncher('xdg-open {value}', async () => {
        const h = await ask(pg);
        expect(h.nbWeb.state === 'unset' && h.nbWeb.url === '', `not a web launcher: ${JSON.stringify(h.nbWeb)}`);
    });

    expect(await pg.evaluate(() => TW.NB_MISSING.down) === "nb-web isn't reachable", 'one wording');
});
