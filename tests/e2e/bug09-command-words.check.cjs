// Bug 9: command mode knows task's own commands. A custom report, an alias (zz) and an abbreviation
// run in the console; a filter (no command word) still becomes the List's raw filter.
const { check, expect, B, sleep } = require('./lib.cjs');
async function run(pg, text) {
    const sent = [];
    const onWs = ws => ws.on('framesent', f => sent.push(String(f.payload)));
    pg.on('websocket', onWs);
    await pg.goto(B + '/about.html');                     // clear the last raw filter first
    await pg.evaluate(() => sessionStorage.removeItem('tw-raw-filter'));
    await pg.goto(B + '/');
    await pg.waitForSelector('.card-desc-text');
    await pg.click('#tw-mode-toggle');
    await pg.fill('#tw-cmd-input', text);
    await pg.press('#tw-cmd-input', 'Enter');
    await sleep(1500);
    pg.off('websocket', onWs);
    const ptyFirst = sent.find(s => s.startsWith('{'));
    const raw = await pg.evaluate(() => sessionStorage.getItem('tw-raw-filter') || '');
    return { pty: ptyFirst ? JSON.parse(ptyFirst).cmd : null, raw };
}
check(async pg => {
    for (const text of ['mine', 'zz 3', 'proj', 'description.has:alpha mine']) {
        const r = await run(pg, text);
        expect(r.pty === text, `"${text}" should run in the console: ${JSON.stringify(r)}`);
    }
    // 'co' is ambiguous (columns, commands, completed, config, context, count): not a command
    for (const text of ['project:work', '+tagged', 'co']) {
        const r = await run(pg, text);
        expect(r.pty === null && r.raw === text, `"${text}" should be a raw filter: ${JSON.stringify(r)}`);
    }
});
