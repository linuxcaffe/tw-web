// The Projects and Tags sidebars show their count at the right of the header (PROJECTS 5), not
// at the end of the active/all toggle row, where it got lost among the buttons (user 2026-11-27).
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    await pg.setViewportSize({ width: 1280, height: 800 });
    await pg.goto(B + '/');
    await pg.waitForSelector('.task-card');
    await sleep(1500);
    for (const sel of ['.list-proj-sidebar', '.list-tags-sidebar']) {
        const r = await pg.evaluate(s => {
            const sb = document.querySelector(s), lbl = sb && sb.querySelector('.tw-sb-label');
            const tot = lbl && lbl.querySelector('.tw-proj-total');
            if (!tot) return { inLabel: false, inBar: !!(sb && sb.querySelector('.tw-toggle-bar .tw-proj-total')) };
            const lr = lbl.getBoundingClientRect(), tr = tot.getBoundingClientRect();
            return { inLabel: true, text: tot.textContent, rightGap: Math.round(lr.right - tr.right),
                     inBar: !!sb.querySelector('.tw-toggle-bar .tw-proj-total') };
        }, sel);
        expect(r.inLabel && !r.inBar, `${sel}: count isn't in the header: ${JSON.stringify(r)}`);
        expect(/^\d+$/.test(r.text) && r.rightGap < 20, `${sel}: count not at the header's right: ${JSON.stringify(r)}`);
    }
    // Toggling the mode re-renders: the count stays in the header
    await pg.click('.list-tags-sidebar .tw-toggle-btn[data-mode="all"]'); await sleep(600);
    const after = await pg.$$eval('.list-tags-sidebar .tw-sb-label .tw-proj-total', e => e.length);
    expect(after === 1, `tags sidebar after toggling: ${after} counts in the header`);
});
