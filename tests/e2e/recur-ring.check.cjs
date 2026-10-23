// A ring round the priority dot marks a recurring instance (green; a template's is violet, TW.recur,
// unit-tested in tests/js). A task with no priority still gets the ring, round an empty dot.
const { execFileSync } = require('child_process');
const { check, expect, task, B, sleep } = require('./lib.cjs');
const SHOTS = process.env.TW_E2E_SHOTS || '';
const T = 'c54a475b-44e7-4118-af02-222d021a2d42';   // a template's UUID; the template needn't exist
check(async pg => {
    task('count');   // guard: a scratch server
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    execFileSync('task', ['rc.verbose=nothing', 'import'], { env: process.env, input: JSON.stringify([
        { status: 'pending', description: 'ring instance', rtemplate: T, rindex: '3',
          due: today + 'T120000Z', entry: today + 'T000000Z' },
    ]) });
    const ring = sel => pg.locator('.task-card', { hasText: sel }).locator('.card-pri-dot')
        .evaluate(e => [e.className, getComputedStyle(e).outlineStyle]).catch(() => null);

    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    const inst = await ring('ring instance');
    expect(inst && inst[0].includes('recur-instance') && inst[1] === 'solid', 'instance has no ring: ' + inst);
    const plain = await pg.locator('.task-card', { hasText: 'gamma home sched' }).locator('.card-pri-dot.recur-instance, .card-pri-dot.recur-template').count();
    expect(plain === 0, 'a plain task has a ring');
    if (SHOTS) await pg.screenshot({ path: SHOTS + '/list.png' });

    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-ev-title');
    await sleep(500);
    const ev = await pg.locator('.fc-pri-dot.recur-instance').count();
    expect(ev > 0, 'calendar event for the instance has no ring');
    if (SHOTS) await pg.screenshot({ path: SHOTS + '/calendar.png' });
});
