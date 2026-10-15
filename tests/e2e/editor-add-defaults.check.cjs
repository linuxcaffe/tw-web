// The Add modal starts from the nav filter (project, priority, tags), so a run of related tasks
// needs no retyping; Edit keeps the task's own values. The project field suggests the
// Projects sidebar's projects.
const { check, expect, B, sleep } = require('./lib.cjs');
async function openAdd(pg) {
    await pg.evaluate(() => document.dispatchEvent(new CustomEvent('tw-open-add')));
    await pg.waitForSelector('#task-editor-save', { state: 'visible' });
    await sleep(300);
}
const fields = pg => pg.evaluate(() => ({
    project:  document.querySelector('#task-editor-project').value,
    priority: document.querySelector('#task-editor-priority').value,
    tags:     document.querySelector('#task-editor-tags').value,
}));
const setNav = (pg, s) => pg.evaluate(s => window.twNav.setState(s, { clientOnly: true }), s);
check(async pg => {
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');

    await setNav(pg, { project: 'home', priority: 'H', tags: 'next, errand' });
    await openAdd(pg);
    let f = await fields(pg);
    expect(f.project === 'home' && f.priority === 'H' && f.tags === 'next, errand',
           `Add didn't start from the filter: ${JSON.stringify(f)}`);
    const opts = await pg.$$eval('#task-editor-project-options option', os => os.map(o => o.value));
    expect(opts.includes('home') && opts.includes('work'), `no project suggestions: ${JSON.stringify(opts)}`);
    await pg.keyboard.press('Escape');

    // Ranges and negatives name no single value: no defaults from them
    await setNav(pg, { project: '.none:', priority: '< M', tags: '.hasnt:x' });
    await openAdd(pg);
    f = await fields(pg);
    expect(!f.project && !f.priority && !f.tags, `defaults from a range or negative: ${JSON.stringify(f)}`);
    await pg.keyboard.press('Escape');

    // Edit shows the task, not the filter
    await setNav(pg, { project: '', priority: '', tags: '' });
    await setNav(pg, { project: '.is:work' });
    await sleep(300);
    await pg.locator('.task-card', { hasText: 'alpha work task' }).locator('.ca-edit').click();
    await pg.waitForSelector('#task-editor-save', { state: 'visible' });
    await sleep(500);
    await setNav(pg, { project: '.is:work', priority: 'H' });   // filter changes while editing
    f = await fields(pg);
    expect(f.project === 'work' && f.priority === '', `Edit took filter values: ${JSON.stringify(f)}`);
});
