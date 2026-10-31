// A hook's reason (CONVENTIONS §2, §3): it titles the spool offer (the command shown under it), and
// the console a tw_needs_pty opens.
const { check, expect, B, sleep } = require('./lib.cjs');
check(async pg => {
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    await pg.evaluate(() => TW.api.handleWriteResult({ success: true, deferred_cmd: 'echo spooled-ok',
                                                      deferred_reason: "annn: write a note for 'Plan'" }));
    const title = await pg.textContent('#tw-terminal-offer-title');
    const cmd = await pg.textContent('#tw-terminal-offer-cmd');
    expect(title === "annn: write a note for 'Plan'", 'the offer title is ' + JSON.stringify(title));
    expect(cmd === 'echo spooled-ok', 'the offer command is ' + JSON.stringify(cmd));
    await pg.click('.tw-offer-btn-dismiss');
    await pg.evaluate(() => TW.api.handleWriteResult({ success: false, needs_pty: true, cmd: '1 delete',
                                                      reason: 'deps-mgmt: asks about dependents' }));
    await pg.waitForSelector('#tw-pty-titlebar');
    const bar = await pg.textContent('#tw-pty-titlebar span');
    expect(bar === 'deps-mgmt: asks about dependents · task 1 delete', 'the console title is ' + JSON.stringify(bar));
});
