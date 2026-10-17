// The moon's phases in the Agenda: on the date line of a day that has one, with icon and time;
// never a line of their own (four a month would bury the tasks). Settings can turn them off.
const { check, expect, B, sleep, withHolidays } = require('./lib.cjs');
check(async pg => withHolidays([
    ['Full Moon', 0, undefined, { kind: 'moon', time: '15:30' }],
    ['New Moon', 3, undefined, { kind: 'moon', time: '09:05' }],
], async () => {
    await pg.goto(B + '/agenda.html');
    await pg.waitForSelector('.agenda-layer');
    await sleep(500);
    const heads = await pg.$$eval('.agenda-date-header', els => els.map(e => e.textContent));
    expect(heads[0].startsWith('TODAY') && heads[0].endsWith(' · 🌕 Full Moon 15:30'), `today: ${JSON.stringify(heads)}`);
    expect(!heads.some(h => h.includes('New Moon')), `a line for a moon alone: ${JSON.stringify(heads)}`);

    await pg.evaluate(() => fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cal_moon: false }) }));
    await pg.reload();
    await pg.waitForSelector('.agenda-date-header');
    await sleep(800);
    expect(await pg.$$eval('.agenda-layer', e => e.length) === 0, 'moon shown with cal_moon off');
    await pg.evaluate(() => fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cal_moon: true }) }));
}));
