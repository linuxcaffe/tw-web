// Bug 3, the other half: after a timeout, "Open in terminal" runs the task command, and the
// pane stays open so the user sees what happened.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    const received = [];
    pg.on('websocket', ws => ws.on('framereceived', f => received.push(String(f.payload))));
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    // What a write returns when `task 1 info` hit the 15 s limit (cmd is what follows `task`)
    await pg.evaluate(() => TW.api.handleWriteResult({ success: false, timed_out: true, cmd: '1 info' }));
    await pg.click('.tw-offer-btn-run');
    await sleep(3000);
    const out = received.join('');
    expect(/alpha work task/.test(out), 'the PTY did not run task 1 info; it said: ' +
           JSON.stringify(out.replace(/\x1b\[[0-9;]*m/g, '').slice(-120)));
    expect(await pg.isVisible('#tw-pty-container'), 'the terminal pane closed by itself');
});
