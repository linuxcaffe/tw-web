// Bug 11: Menu → Terminal opens the in-page console, so it shows even with no desktop terminal.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    // A box with no terminal emulator (Termux, headless), as the old check route reported it
    await pg.route('**/api/terminal/check', r => r.fulfill({ json: { available: false } }));
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    await sleep(500);
    const shown = await pg.$eval('.tw-menu-item[data-menu="terminal"]', el => el.style.display !== 'none');
    expect(shown, 'Menu → Terminal is hidden');
});
