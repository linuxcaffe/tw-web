// tw-nb-interop M7 step 3 (djp 2026-11-04): an nb: link when nb-web doesn't answer opens the note
// from this device instead: in Documents on Android (termux-open, test_nb_note_fallback.py), else
// read-only here. Each says it's a fallback and why; a note that isn't here is said to be missing.
// The scratch server has its own NB_DIR (never ~/.nb); its TW_TASK_DIR is TASKDATA.
const fs = require('fs');
const path = require('path');
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
    const nbDir = process.env.NB_DIR;
    expect(nbDir && !nbDir.startsWith(path.join(require('os').homedir(), '.nb')), `scratch NB_DIR: ${nbDir}`);
    const tn = path.join(nbDir, 'tasknotes');
    fs.mkdirSync(tn, { recursive: true });
    fs.writeFileSync(path.join(tn, 'tile-order.note.md'), '---\ntype: task\n---\n# Tile order\n\nGrout: charcoal.\n');
    const link = path.join(process.env.TASKDATA, 'notes');
    if (!fs.existsSync(link)) fs.symlinkSync(tn, link);

    task('/epsilon/', 'annotate', '--', 'nb: tasknotes:tile-order.note.md');
    task('/epsilon/', 'annotate', '--', 'nb: tasknotes:not-here.note.md');
    const card = () => pg.locator('.task-card', { hasText: 'epsilon work secs' });
    const popups = [];
    pg.context().on('page', p => popups.push(p.url()));

    await withLauncher('http://127.0.0.1:9/#{value}', async () => {          // nb-web: nothing there
        await pg.goto(B + '/');
        await pg.waitForSelector('.card-desc-text');
        await sleep(1500);                                                   // launchers + health warm
        await card().locator('a.ann-launch', { hasText: 'tile-order' }).click();
        const ro = pg.locator('#tw-note-ro');
        await ro.waitFor({ timeout: 5000 });
        expect((await ro.textContent()).includes('Grout: charcoal.'), 'the note text');
        expect((await ro.locator('.tw-note-ro-why').textContent()).includes("nb-web isn't reachable"), 'says why');
        expect(popups.length === 0, `opened a window: ${popups.join(' ')}`);
        await pg.keyboard.press('Escape');
        await sleep(200);
        expect(await pg.locator('#tw-note-ro').count() === 0, 'Escape closes it');

        await card().locator('a.ann-launch', { hasText: 'not-here' }).click();
        await sleep(800);
        const note = (await pg.locator('#tw-notification').textContent()) || '';
        expect(note.includes("nb-web isn't reachable") && note.includes('no such note on this device'), `said: ${note}`);
        expect(await pg.locator('#tw-note-ro').count() === 0, 'no view for a missing note');
    });

    await withLauncher(B + '/about.html#{value}', async () => {              // nb-web answers: as before
        await pg.goto(B + '/');
        await pg.waitForSelector('.card-desc-text');
        await sleep(1500);
        await card().locator('a.ann-launch', { hasText: 'tile-order' }).click();
        await pg.waitForURL(u => u.pathname.endsWith('/about.html'), { timeout: 5000 }).catch(() => {});
        expect(pg.url().startsWith(B + '/about.html#tasknotes'), `went to ${pg.url()}`);
    });
});
