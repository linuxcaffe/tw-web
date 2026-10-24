// Your own events in the Agenda: like holidays, a day with one gets a date line even with no
// tasks; the name (📌 and the time for a timed one) follows the date.
const { check, expect, B, sleep, withHolidays } = require('./lib.cjs');
check(async pg => withHolidays([
    ['Dentist', 5, undefined, { kind: 'mine', time: '14:30' }],
    ['Cottage', 6, undefined, { kind: 'mine' }],
], async () => {
    await pg.goto(B + '/agenda.html');
    await pg.waitForSelector('.agenda-layer-mine');
    await sleep(500);
    const heads = await pg.$$eval('.agenda-date-header', els => els.map(e => e.textContent));
    expect(heads.some(h => h.endsWith(' · 📌 Dentist 14:30')), `dentist line: ${JSON.stringify(heads)}`);
    expect(heads.some(h => h.endsWith(' · Cottage')), `cottage line: ${JSON.stringify(heads)}`);
}));
