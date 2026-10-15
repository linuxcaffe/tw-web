// Bug 12: the List's priority sort knows 1–6 (uda.priority.values=1,2,3,4,5,6,H,M,L).
const { check, expect, B, task, cardTexts } = require('./lib.cjs');
check(async pg => {
    task('1', 'modify', 'priority:1');
    task('2', 'modify', 'priority:H');
    task('3', 'modify', 'priority:3');
    task('4', 'modify', 'priority:L');
    await pg.goto(B + '/');
    await pg.evaluate(() => { localStorage.setItem('tw-sort-field', 'priority');
                              localStorage.setItem('tw-sort-reverse', 'true'); });
    await pg.reload();
    await pg.waitForSelector('.card-desc-text');
    const first = (await cardTexts(pg)).slice(0, 4).map(t => t.split(' ')[0]);
    expect(JSON.stringify(first) === '["alpha","gamma","beta","delta"]',
           `highest priority first should be 1, 3, H, L: ${JSON.stringify(first)}`);
});
