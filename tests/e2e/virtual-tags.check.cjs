// The tags input takes virtual tags (+TODAY, -BLOCKED…), which task works out (/api/vtags), and
// +x / -x terms. The Tags sidebar lists them, with man task's description. A real
// tag named NEXT is an ordinary tag in 2.6.2 and shows in the sidebar (the old list hid it).
// The sidebar's third mode, [virtual], lists them in place of the real tags.
const { check, expect, task, B, sleep, cardTexts } = require('./lib.cjs');
async function typeTags(pg, text) {
    await pg.fill('#tw-tags-input', text);
    await sleep(1200);   // input debounce, then the /api/vtags round trip and re-render
}
const sorted = a => [...a].sort().join(' | ');
check(async pg => {
    task('1', 'modify', '+NEXT');   // alpha work task
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');

    // beta and omega are due later today, whatever the hour
    await typeTags(pg, 'TODAY');
    let got = await cardTexts(pg);
    expect(sorted(got) === 'beta home due | omega home due', `TODAY: ${JSON.stringify(got)}`);

    await typeTags(pg, '+TODAY -omega');   // -omega: no such tag, so nothing excluded
    got = await cardTexts(pg);
    expect(got.length === 2, `+TODAY -omega: ${JSON.stringify(got)}`);

    await typeTags(pg, '-TODAY');
    got = await cardTexts(pg);
    expect(got.length === 5 && !got.includes('beta home due') && !got.includes('omega home due'),
           `-TODAY: ${JSON.stringify(got)}`);

    await typeTags(pg, '+NEXT, -TODAY');
    got = await cardTexts(pg);
    expect(sorted(got) === 'alpha work task', `+NEXT, -TODAY: ${JSON.stringify(got)}`);
    await typeTags(pg, '-NEXT');
    got = await cardTexts(pg);
    expect(got.length === 6 && !got.includes('alpha work task'), `-NEXT: ${JSON.stringify(got)}`);

    // Sidebar: [active] [all] [virtual]. Active lists the real NEXT tag and no virtual ones;
    // virtual lists man task's tags, descriptions as tooltips, and no real ones
    await typeTags(pg, '');
    const sb = '#tw-tags-sidebar';
    const item = pick => pg.locator(`${sb} .tw-pick-item[data-pick="${pick}"]`);
    expect(await item('NEXT').count() === 1, 'real +NEXT tag not in the active list');
    expect(await item('SCHEDULED').count() === 0, 'virtual tags in the active list');
    await pg.click(`${sb} [data-mode="virtual"]`);
    await sleep(500);
    const sched = item('SCHEDULED');
    expect(await sched.count() === 1, 'no +SCHEDULED in the virtual list');
    expect(await item('NEXT').count() === 0, 'real tags in the virtual list');
    expect(await sched.getAttribute('title') === 'Matches if the task is scheduled', 'no man task description');
    expect(await item('CHILD').count() === 0, 'deprecated CHILD listed');
    const total = await pg.textContent(`${sb} .tw-proj-total`);
    expect(total === '29', `virtual count: ${total}`);
    await sched.click();
    await sleep(1200);
    got = await cardTexts(pg);
    expect(sorted(got) === 'gamma home sched', `+SCHEDULED click: ${JSON.stringify(got)}`);
    expect(await pg.inputValue('#tw-tags-input') === 'SCHEDULED', 'click did not fill the tags input');
    expect(await sched.evaluate(e => e.classList.contains('active')), '+SCHEDULED not highlighted');

    // The panel (side menu → Tags) has the same three modes
    await pg.click('#tw-logo-btn');
    await pg.locator('.tw-menu-item', { hasText: 'Tags' }).click();
    await sleep(500);
    const panel = '#tw-panel-body';
    expect(await pg.locator(`${panel} [data-mode="virtual"].active`).count() === 1, 'panel not in virtual mode');
    expect(await pg.locator(`${panel} .tw-pick-item[data-pick="OVERDUE"]`).count() === 1, 'panel lists no virtual tags');
});
