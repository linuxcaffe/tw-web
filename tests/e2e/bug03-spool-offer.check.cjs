// Bug 3: "Open in terminal" for a spooled shell command must run that command, and keep the pane open.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    const received = [];
    pg.on('websocket', ws => ws.on('framereceived', f => received.push(String(f.payload))));
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    await pg.evaluate(() => window.twTerminal.offerTerminal('echo spooled-ok'));
    await pg.click('.tw-offer-btn-run');
    await sleep(3000);
    const out = received.join('');
    expect(/spooled-ok/.test(out), 'the PTY did not run the shell command; it said: ' +
           JSON.stringify(out.replace(/\x1b\[[0-9;]*m/g, '').slice(-120)));
    expect(await pg.isVisible('#tw-pty-container'), 'the terminal pane closed by itself');
});
