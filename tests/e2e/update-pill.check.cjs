// Under the menu logo: tw-web's version, and when the server has fetched newer commits a pill,
// "Update (2 new)", whose tooltip lists them; tapping it updates and reloads the page. Stubbed:
// a real /api/update would git pull the folder the scratch server runs from.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    await pg.setViewportSize({ width: 1280, height: 800 });
    let info = { version: 'v2.0.0-27', behind: 0, subjects: [], can_update: true, reason: '', checked: null };
    let updates = 0;
    await pg.route('**/api/version', r => r.fulfill({ json: info }));
    await pg.route('**/api/update', r => { updates++; r.fulfill({ json: { success: true, version: 'v2.0.0-29' } }); });
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    await pg.click('#tw-logo-btn');
    await sleep(400);
    expect((await pg.locator('#tw-cache-ver').textContent()) === 'v2.0.0-27', 'no version under the logo');
    const pill = pg.locator('#tw-update-pill');
    expect(!(await pill.isVisible()), 'pill shown with nothing new');

    // Two commits upstream: the pill appears when the menu opens again
    info = { ...info, behind: 2, subjects: ['Sync: a feature', 'Calendar: a fix'] };
    await pg.click('.tw-menu-header img');          // the header closes the menu
    await sleep(400);
    await pg.click('#tw-logo-btn');
    await sleep(400);
    expect(await pill.isVisible(), 'no pill with 2 new commits');
    expect((await pill.textContent()) === 'Update (2 new)', `pill says ${JSON.stringify(await pill.textContent())}`);
    expect((await pill.getAttribute('title')).includes('Calendar: a fix'), 'pill tooltip lacks the commits');

    // Tapping it updates, then the page reloads (dialogs are accepted by the harness)
    let reloaded = false;
    pg.on('framenavigated', f => { if (f === pg.mainFrame()) reloaded = true; });
    await pill.click();
    await sleep(6000);
    expect(updates === 1, `update posted ${updates} times`);
    expect(reloaded, 'the page did not reload after the update');

    // Local edits (or another branch): the pill says so and can't be tapped
    info = { ...info, can_update: false, reason: 'there are local changes' };
    await pg.waitForSelector('.card-desc-text');
    await pg.click('#tw-logo-btn');
    await sleep(400);
    expect(await pill.isDisabled(), 'pill can be tapped over local changes');
    expect((await pill.getAttribute('title')).includes('local changes'), 'tooltip does not say why');
});
