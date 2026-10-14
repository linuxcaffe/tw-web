// List shows the seeded pending tasks, and the nav filter input narrows them.
const { check, expect, B, sleep, cardTexts } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    const all = await cardTexts(pg);
    expect(all.length === 7, `List shows ${all.length} tasks, expected the 7 seeded`);
    await pg.fill('#tw-filter-input', 'kanban');
    await sleep(900);   // 400 ms debounce
    const some = (await cardTexts(pg)).sort();
    expect(JSON.stringify(some) === JSON.stringify(['delta home kanban', 'zeta work kanban']),
           `filter "kanban" left ${JSON.stringify(some)}`);
});
