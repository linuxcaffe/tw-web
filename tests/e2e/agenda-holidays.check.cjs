// Holidays in the Agenda (plan tw:docs/tw-holidays-and-layers-plan.md, user 2026-10-17): a
// holiday's name follows the date on its line; a holiday with no tasks gets its own line in date
// order, up to agenda_holiday_days ahead (or as far as the tasks shown reach); on a task day far
// ahead it still annotates that day's line; Settings can turn holidays off.
const { check, expect, B, sleep, withHolidays } = require('./lib.cjs');
const lines = pg => pg.$$eval('#tasks-container > *', els => els.map(e =>
    e.classList.contains('agenda-date-header') ? 'H:' + e.textContent
    : e.classList.contains('agenda-nothing') ? 'N' : 'C:' + (e.querySelector('.card-desc-text')?.textContent || '')));
const setNav = (pg, s) => pg.evaluate(s => window.twNav.setState(s, { clientOnly: true }), s);
check(async pg => withHolidays([['Soon Day', 3], ['Far Day', 40], ['Epsilon Day', '20301201'], ['Today Day', 0]],
  async () => {
    await pg.goto(B + '/agenda.html');
    await pg.waitForSelector('.agenda-layer');
    await sleep(500);
    let seq = await lines(pg);
    const at = s => seq.findIndex(x => x.startsWith('H:') && x.includes(s));
    expect(at('Today Day') >= 0 && seq[at('Today Day')].startsWith('H:TODAY'), `today: ${JSON.stringify(seq)}`);
    const soon = at('· Soon Day');
    expect(soon > at('Today Day'), `no Soon Day line after TODAY: ${JSON.stringify(seq)}`);
    expect(seq[soon + 1]?.startsWith('H:'), `Soon Day line has cards under it: ${JSON.stringify(seq)}`);
    // epsilon (2030) is shown, so the lines reach that far: Far Day gets one, before epsilon's
    expect(at('· Far Day') > soon, `Far Day: ${JSON.stringify(seq)}`);
    const eps = at('· Epsilon Day');
    expect(eps > at('· Far Day') && seq[eps + 1] === 'C:epsilon work secs', `epsilon's line: ${JSON.stringify(seq)}`);
    const name = await pg.$eval('.agenda-layer', e => e.textContent);
    expect(!/[<>]/.test(name), `name: ${name}`);

    // Home tasks are all today: the lines reach agenda_holiday_days (30) ahead, not 40
    await setNav(pg, { project: '.is:home' });
    await sleep(800);
    seq = await lines(pg);
    expect(at('· Soon Day') > 0 && at('· Far Day') === -1, `home: ${JSON.stringify(seq)}`);

    // Off in Settings: no holiday anywhere
    const r = await pg.evaluate(() => fetch('/api/config', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cal_holidays: false }) }).then(r => r.json()));
    expect(r.success, `save: ${JSON.stringify(r)}`);
    await pg.reload();
    await pg.waitForSelector('.agenda-date-header');
    await sleep(800);
    expect(await pg.$$eval('.agenda-layer', els => els.length) === 0, 'holidays shown with cal_holidays off');
    await pg.evaluate(() => fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cal_holidays: true }) }));
}));
