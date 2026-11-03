// Bug 17 (djp, 2026-11-03): adding an annotation in the editor, then Save, said "No changes".
// The annotation is written at once by its own "Save note" button; the main Save then found no
// changed field and reported nothing done. It must count as a save: no "No changes", and the
// save's follow-up runs (onSaveSuccess: the List redraws, an embedding nb-web hears
// tw-task-saved).
const { check, expect, B, sleep, exportOne } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    await pg.evaluate(() => {
        window._notes = [];
        document.addEventListener('tw-show-notification', e => window._notes.push(e.detail.message));
    });
    await pg.locator('.task-card', { hasText: 'epsilon work secs' }).locator('.ca-edit').click();
    await pg.waitForSelector('#task-editor-save', { state: 'visible' });
    await pg.click('#te-ann-add-btn');
    await pg.locator('#te-ann-cm-host .cm-content, #te-ann-cm-host textarea').first().click();
    await pg.keyboard.type('nb:');
    await pg.click('#te-ann-save-btn');
    await sleep(1200);
    if (!(exportOne('/epsilon/').annotations || []).some(a => a.description === 'nb:'))
        throw new Error('the annotation itself was not written');
    await pg.click('#task-editor-save');
    await sleep(800);
    const notes = await pg.evaluate(() => window._notes);
    expect(!notes.includes('No changes'), `said "No changes" after an annotation was added: ${JSON.stringify(notes)}`);
    expect(await pg.locator('.task-card', { hasText: 'epsilon work secs' }).innerText().then(t => t.includes('nb:')),
           'the List card does not show the new annotation');
});
