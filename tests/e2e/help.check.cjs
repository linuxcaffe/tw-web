// Help (tw:docs/tw-web-help-plan.md, step 2): four tabs, foldable categories, the filter,
// A–Z, a page and its links, Back, deep links, the Commands list from `task commands`,
// and raw HTML in a page shown as text, never run.
const { check, expect, B, sleep } = require('./lib.cjs');
const V = '.help-list:not([hidden]) ';   // the shown tab's list (other tabs' lists stay in the DOM, hidden)

check(async pg => {
    const errors = [];
    pg.on('pageerror', e => errors.push(e.message));

    // Keys is the default tab, and shows its page
    await pg.goto(B + '/help.html');
    await pg.waitForSelector('#help-page .help-md h1');
    const tabs = await pg.$$eval('.help-tab', b => b.map(x => x.textContent));
    expect(JSON.stringify(tabs) === JSON.stringify(['Keys', 'tw-web', 'Commands', 'Taskwarrior']), 'tabs: ' + tabs);
    expect((await pg.textContent('.help-md h1')) === 'Keyboard shortcuts', 'Keys page title');
    expect((await pg.$$('.help-md table')).length === 3, 'Keys has its three tables');

    // Taskwarrior: Getting Started open, the rest folded; a count on each heading
    await pg.click('.help-tab[data-tab="taskwarrior"]');
    await pg.waitForSelector(V + 'details.help-cat');
    const cats = await pg.$$eval(V + 'details.help-cat', d => d.map(x => [x.querySelector('.help-cat-name').textContent, x.open]));
    expect(cats[0][0] === 'Getting Started' && cats[0][1], 'Getting Started first and open: ' + JSON.stringify(cats));
    expect(cats.slice(1).every(c => !c[1]), 'other categories folded');
    expect((await pg.textContent(V + 'details.help-cat[data-cat="basic-usage"] .help-cat-count')) === '(14)', 'Basic Usage (14)');

    // the filter opens the categories with a match and hides the rest
    await pg.fill(V + '.help-filter', 'durations');
    const vis = await pg.$$eval(V + '.help-item:not([hidden]) .help-item-link', a => a.map(x => x.textContent));
    expect(JSON.stringify(vis) === '["Durations"]', 'filter "durations": ' + JSON.stringify(vis));
    expect(await pg.$eval(V + 'details[data-cat="basic-usage"]', d => d.open), 'filter opens Basic Usage');
    await pg.fill(V + '.help-filter', '');
    await sleep(50);
    expect(!(await pg.$eval(V + 'details[data-cat="basic-usage"]', d => d.open)), 'clearing the filter folds it again');

    // a page; a link to another page; Back to the list
    await pg.goto(B + '/help.html#taskwarrior/filter');
    await pg.waitForSelector('.help-md h1');
    expect((await pg.textContent('.help-md h1')) === 'Filters', 'deep link opens Filters');
    const esc = await pg.getAttribute('.help-md a:text("described here")', 'href');
    expect(esc === '#taskwarrior/escapes', 'in-help link becomes a route: ' + esc);
    await pg.click('.help-md a:text("described here")');
    await pg.waitForFunction(() => document.querySelector('.help-md h1')?.textContent.includes('Escaping'));
    await pg.goBack();
    await pg.waitForFunction(() => document.querySelector('.help-md h1')?.textContent === 'Filters');
    await pg.click('.help-back');
    await pg.waitForSelector(V + 'details.help-cat');
    expect(await pg.$eval('#help-page', p => p.hidden), 'Back shows the list');

    // a command page links back up to a topic (../x.md)
    await pg.goto(B + '/help.html#commands/modify');
    await pg.waitForSelector('.help-md h1');
    const hrefs = await pg.$$eval('.help-md a', a => a.map(x => x.getAttribute('href')));
    expect(hrefs.includes('#commands/append'), 'modify links append in its tab: ' + hrefs.join(' '));

    // Commands: from `task commands`, task's categories, linked where a page exists
    await pg.goto(B + '/help.html#commands');
    await pg.waitForSelector(V + 'details.help-cat');
    const ccats = await pg.$$eval(V + 'details.help-cat', d => d.map(x => x.dataset.cat));
    expect(ccats[0] === 'report' && ccats.includes('internal'), 'command categories: ' + ccats);
    expect(!(await pg.$eval(V + 'details[data-cat="internal"]', d => d.open)), 'internal folded');
    expect(await pg.$(V + 'details[data-cat="operation"] a.help-item-link[href="#commands/add"]'), 'add links its page');
    expect(await pg.$(V + 'details[data-cat="operation"] .help-item-nolink:text("annotate")'), 'annotate listed, no page');

    // A–Z: one list, category in the left column; remembered
    await pg.click('.help-list:not([hidden]) .help-mode-btn[data-mode="az"]');
    await pg.waitForSelector('.help-list:not([hidden]) .help-az');
    const firstCat = await pg.textContent('.help-list:not([hidden]) .help-az .help-item-cat');
    expect(!!firstCat, 'A–Z shows the category');
    await pg.reload();
    await pg.waitForSelector('.help-list:not([hidden]) .help-az');
    await pg.click('.help-list:not([hidden]) .help-mode-btn[data-mode="grouped"]');

    // a category deep link unfolds it
    await pg.goto(B + '/help.html#taskwarrior/advanced-topics');
    await pg.waitForSelector(V + 'details.help-cat');
    expect(await pg.$eval(V + 'details[data-cat="advanced-topics"]', d => d.open), 'category deep link unfolds it');

    // raw HTML in a page is text: served page replaced in the browser only
    await pg.route('**/api/help/page/tw-web/settings', r => r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, markdown: '# T\n\n<img src=x onerror="window.__pwned=1">\n\n[x](javascript:window.__pwned=2)\n' }),
    }));
    await pg.goto(B + '/help.html#tw-web/settings');
    await pg.waitForSelector('.help-md h1');
    await sleep(200);
    expect(!(await pg.$('.help-md img')), 'raw <img> not parsed');
    expect(!(await pg.evaluate(() => window.__pwned)), 'nothing ran');
    expect((await pg.textContent('.help-md')).includes('<img'), 'raw HTML shown as text');

    expect(!errors.length, 'page errors: ' + errors.join(' | '));
});
