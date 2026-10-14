// Bug 1: a command run in the PTY console must show on the List when the console ends.
const { check, expect, B, sleep, cardTexts, exportOne } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    await pg.click('#tw-mode-toggle');
    await pg.fill('#tw-cmd-input', '1 done');
    await pg.press('#tw-cmd-input', 'Enter');
    for (let i = 0; i < 40 && exportOne('1')?.status !== 'completed'; i++) await sleep(250);
    if (exportOne('alpha')?.status !== 'completed')
        throw new Error('the console never completed task 1');   // a broken check, not the bug
    await sleep(2000);   // the console's end-of-session refresh
    expect(!(await cardTexts(pg)).includes('alpha work task'),
           'task completed in the console is still listed (stale cache)');
});
