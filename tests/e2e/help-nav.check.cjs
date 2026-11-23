// Help is a layer over the view you came from (djp 2026-11-23): Escape and ? go back to it,
// the nav bar's add button opens the Add dialog there, a nav-bar action leaves Help, typing a
// filter doesn't leave mid-word; three tabs, Commands under Taskwarrior.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
  await pg.setViewportSize({ width: 360, height: 700 });
  const toHelp = async () => {
    await pg.goto(B + '/kanban.html'); await pg.waitForSelector('#tw-nav-bar');
    await pg.keyboard.press('?'); await pg.waitForURL(/help\.html/);
    await pg.waitForSelector('.help-tab');
  };
  await toHelp();
  const tabs = await pg.$$eval('.help-tab', bs => bs.map(b => b.textContent));
  expect(tabs.join() === 'Keys,tw-web,Taskwarrior', 'top tabs: ' + tabs);
  const tops = await pg.$$eval('.help-tab', bs => bs.map(b => Math.round(b.getBoundingClientRect().top)));
  expect(new Set(tops).size === 1, 'tabs wrap at 360 px: ' + tops);
  const active = await pg.$eval('.tw-nav-link.active', a => a.textContent);
  expect(active === 'Kanban', 'nav marks the view Help returns to, got ' + active);

  await pg.goto(B + '/help.html#commands'); await pg.waitForSelector('.help-sub-btn.active');
  expect(await pg.$eval('.help-tab.active', b => b.textContent) === 'Taskwarrior', '#commands under Taskwarrior');
  expect(await pg.$eval('.help-sub-btn.active', b => b.textContent) === 'Commands', 'Commands sub-tab active');

  await pg.keyboard.press('Escape'); await pg.waitForURL(/kanban\.html/, { timeout: 5000 });

  await toHelp();
  await pg.click('#tw-add-area');
  await pg.waitForURL(/kanban\.html/, { timeout: 5000 });
  await pg.waitForSelector('.task-editor-modal', { state: 'visible', timeout: 5000 });
  expect(!/add=1/.test(pg.url()), 'add=1 stays in the address: ' + pg.url());

  await toHelp();
  await pg.fill('#tw-filter-input', 'zz'); await sleep(800);
  expect(/help\.html/.test(pg.url()), 'typing a filter left Help mid-word');
  await pg.keyboard.press('Enter'); await pg.waitForURL(/kanban\.html/, { timeout: 5000 });

  await toHelp();
  await pg.keyboard.press('?'); await pg.waitForURL(/kanban\.html/, { timeout: 5000 });
});
