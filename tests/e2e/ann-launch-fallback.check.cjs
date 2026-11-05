// An nb: annotation link finds nb-web as the menu's nb-web link does (djp 2026-11-05: yoga's
// tw-web, seen from the phone, read its launcher's localhost:5080, found nothing there and showed
// the read-only note while nb-web answered at yoga's :5001). The launcher's address down,
// nb-web's usual port where this page is answering: the link goes there. Stand-ins only.
const fs = require('fs');
const { check, expect, B, sleep, task } = require('./lib.cjs');

const OWN = new URL(B).protocol + '//' + new URL(B).hostname + ':5001/';

check(async pg => {
    task('/epsilon/', 'annotate', '--', 'nb: tasknotes:tile-order.note.md');
    const file = process.env.TW_WEB_SETTINGS;
    const saved = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    try {
        const s = saved ? JSON.parse(saved) : {};
        s.annotation_launchers = { ...(s.annotation_launchers || {}), nb: 'http://nb.down/#{value}' };
        fs.writeFileSync(file, JSON.stringify(s));
        for (const target of [pg, pg.context()]) {
            await target.route('http://nb.down/**', r => r.abort());
            await target.route(OWN + '**', r => r.fulfill({ contentType: 'text/html', body: 'nb-web at its port' }));
        }
        await pg.goto(B + '/');
        await pg.waitForSelector('.card-desc-text');
        await sleep(2000);                                  // launchers and the health probe
        const link = pg.locator('.task-card', { hasText: 'epsilon work secs' }).locator('a.ann-launch').first();
        const [tab] = await Promise.all([pg.context().waitForEvent('page', { timeout: 5000 }).catch(() => null),
                                         link.click()]);
        expect(tab, 'no new tab: it took the fallback (read-only note, or Documents)');
        await tab.waitForLoadState().catch(() => {});
        expect(tab.url().startsWith(OWN + '#tasknotes'), `the link went to ${tab.url()}`);
        const readOnly = await pg.locator('.tw-note-readonly, [data-note-readonly]').count();
        expect(readOnly === 0, 'showed the read-only note as well');
    } finally {
        if (saved === null) fs.unlinkSync(file); else fs.writeFileSync(file, saved);
    }
});
