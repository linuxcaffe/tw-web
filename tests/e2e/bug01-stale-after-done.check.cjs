// Bug 1: a task completed on the List must not come back after Agenda → List.
const { check, expect, B, sleep, cardTexts } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    await pg.locator('.task-card', { hasText: 'beta home due' }).locator('.ca-done').click();
    await sleep(1200);
    expect(!(await cardTexts(pg)).includes('beta home due'), 'card still there right after Done');
    await pg.goto(B + '/agenda.html');
    await pg.waitForSelector('.agenda-date-header');
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    await sleep(500);
    expect(!(await cardTexts(pg)).includes('beta home due'),
           'completed task is back on the List after Agenda → List (stale cache)');
});
