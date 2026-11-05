// tw-web opens on one task from a link (djp 2026-11-04): ?rawfilter=uuid:<uuid> starts the list
// filtered to it, as if typed in the raw filter, with the filter bar there to clear it. nb-web's
// task header "Task" links here. The parameter then leaves the address bar (the session keeps
// the filter), so a reload doesn't bring back one already cleared.
const { check, expect, B, sleep, task } = require('./lib.cjs');

check(async pg => {
    const uuid = task('/epsilon/', '_uuids').trim().split(/\s+/)[0];
    expect(/^[0-9a-f-]{36}$/.test(uuid), `uuid ${uuid}`);
    await pg.goto(B + '/?rawfilter=' + encodeURIComponent('uuid:' + uuid));
    await pg.waitForSelector('.task-card');
    await sleep(800);
    const cards = await pg.locator('.task-card').count();
    expect(cards === 1, `${cards} cards, wanted 1`);
    expect((await pg.locator('.task-card').first().textContent()).includes('epsilon'), 'the epsilon task');
    expect(!pg.url().includes('rawfilter='), `still in the URL: ${pg.url()}`);
    const bar = (await pg.locator('#tw-filter-bar, .tw-filter-bar').first().textContent().catch(() => '')) || '';
    expect(bar.includes(uuid.slice(0, 8)) || bar.includes('uuid:'), `filter bar: ${bar}`);
});
