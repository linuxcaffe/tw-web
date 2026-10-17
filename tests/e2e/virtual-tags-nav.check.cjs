// A virtual tag filter survives moving between pages: List → Calendar → List shows the same
// tasks, and the count matches the cards (user, 2026-10-17: count but no list until a reload).
const { check, expect, B, sleep, cardTexts } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    await pg.fill('#tw-tags-input', 'TODAY');
    await sleep(1200);
    const before = await cardTexts(pg);
    expect(before.length === 2, `List TODAY: ${JSON.stringify(before)}`);

    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-ev-title');
    await sleep(1500);
    // Time passes on the Calendar: every cached answer is older than its 30 s
    await pg.evaluate(() => {
        for (const k of Object.keys(sessionStorage)) {
            try { const x = JSON.parse(sessionStorage.getItem(k));
                  if (x && x.ts) { x.ts -= 60_000; sessionStorage.setItem(k, JSON.stringify(x)); } } catch {}
        }
    });
    await pg.goto(B + '/');
    await sleep(2000);
    const after = await cardTexts(pg);
    const count = await pg.textContent('#tw-count');
    expect(after.length === 2, `List TODAY after Calendar: ${JSON.stringify(after)} (count ${count})`);
    expect(count.startsWith('2/'), `count ${count} with ${after.length} cards`);
});
