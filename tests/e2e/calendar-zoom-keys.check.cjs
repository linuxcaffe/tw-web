// The zoom keys help.html documents: W (or D) pressed again on its own view moves to the next
// zoom step, as clicking the active button does. Space repeats the focused view button (the
// browser presses a focused button), so after clicking Week it zooms too, until a click elsewhere.
const { check, expect, B, sleep } = require('./lib.cjs');
const slot = pg => pg.evaluate(() => {
    const d = calendar.getOption('slotDuration');
    return typeof d === 'string' ? d : `${String(d.hours || 0).padStart(2, '0')}:${String(d.minutes || 0).padStart(2, '0')}:00`;
});
check(async pg => {
    await pg.goto(B + '/calendar-planner.html');
    await pg.waitForSelector('.fc-timegrid-body');
    await sleep(500);
    await pg.evaluate(() => document.activeElement && document.activeElement.blur());   // focus off any button
    expect(await slot(pg) === '00:30:00', `Week opened at ${await slot(pg)}`);
    await pg.keyboard.press('W'); await sleep(400);
    expect(await slot(pg) === '01:00:00', `W on Week gave ${await slot(pg)}`);
    await pg.keyboard.press('D'); await sleep(400);
    expect(await slot(pg) === '00:30:00', `D opened Day at ${await slot(pg)}`);
    await pg.keyboard.press('D'); await sleep(400);
    expect(await slot(pg) === '01:00:00', `D on Day gave ${await slot(pg)}`);
    await pg.click('.view-btn[data-view="week"]'); await sleep(400);
    expect(await slot(pg) === '00:30:00', `Week button opened Week at ${await slot(pg)}`);
    await pg.keyboard.press(' '); await sleep(400);
    expect(await slot(pg) === '01:00:00', `Space after clicking Week gave ${await slot(pg)}`);
});
