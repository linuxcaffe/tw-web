// The way to nb-web on a device where the server's address doesn't work (djp 2026-11-05: the
// phone). The side menu has an nb-web entry, and it and N check first: when nb-web doesn't
// answer they say so and take this device's own address, kept in this browser only
// (tw-nb-web-here), which then wins over the `nb` launcher's for N, the menu entry and nb:
// annotation links. Stand-ins only: the real nb-web is never touched.
const { check, expect, B, sleep } = require('./lib.cjs');

const SERVER = 'http://localhost:5001/';       // the scratch server's launcher (default)
const HERE = 'http://nb.here/';

check(async pg => {
    await pg.route(SERVER + '**', r => r.abort());                 // nb-web isn't answering
    await pg.route(HERE + '**', r => r.fulfill({ contentType: 'text/html', body: '<title>nb-web here</title>' }));

    await pg.goto(B + '/kanban.html');
    await sleep(1500);                                              // api/config has answered
    await pg.click('#tw-logo-btn');
    // the menu footer, as nb-web's has (djp 2026-11-05): this station, nb-web, Stop
    const item = pg.locator('#tw-menu-footer #tw-menu-nb');
    await item.waitFor({ timeout: 3000 }).catch(() => {});
    expect(await item.isVisible(), 'an nb-web link in the menu footer');
    const station = (await pg.locator('#tw-menu-station').textContent()) || '';
    expect(station.trim().length > 0, 'the footer names this station');
    expect(await pg.locator('#tw-menu-footer #tw-menu-stop').isVisible(), 'a Stop in the footer');
    await item.click();
    const box = pg.locator('.tw-sibling-ask');
    await box.waitFor({ timeout: 3000 }).catch(() => {});
    expect(await box.isVisible(), 'a question when nb-web does not answer');
    expect((await box.textContent()).includes("doesn't answer"), 'it says nb-web does not answer');
    expect(pg.url() === B + '/kanban.html', `went to ${pg.url()}`);
    const input = box.locator('input');
    expect(await input.inputValue() === SERVER, `prefilled ${await input.inputValue()}`);

    await input.fill('javascript:alert(1)');
    await box.getByRole('button', { name: 'Save and go' }).click();
    await sleep(300);
    expect((await box.textContent()).includes('http://'), 'a bad address is refused, saying why');

    await input.fill(HERE);
    await box.getByRole('button', { name: 'Save and go' }).click();
    await pg.waitForURL(HERE, { timeout: 5000 }).catch(() => {});
    expect(pg.url() === HERE, `Save and go went to ${pg.url()}`);
    await pg.goBack();
    await pg.waitForURL(B + '/kanban.html');
    expect(await pg.evaluate(() => localStorage.getItem('tw-nb-web-here')) === HERE, 'kept on this device');

    // now N goes there at once
    await sleep(800);
    await pg.locator('body').click({ position: { x: 2, y: 200 } });
    await pg.keyboard.press('N');
    await pg.waitForURL(HERE, { timeout: 5000 }).catch(() => {});
    expect(pg.url() === HERE, `N went to ${pg.url()}`);

    // Escape: the question closes, nothing happens
    await pg.goto(B + '/kanban.html');
    await pg.evaluate(() => localStorage.removeItem('tw-nb-web-here'));
    await pg.reload();
    await sleep(1500);
    await pg.locator('body').click({ position: { x: 2, y: 200 } });
    await pg.keyboard.press('N');
    await box.waitFor({ timeout: 3000 }).catch(() => {});
    await pg.keyboard.press('Escape');
    await sleep(300);
    expect(await box.count() === 0, 'Escape closes the question');
    expect(pg.url() === B + '/kanban.html', `Escape went to ${pg.url()}`);
});
