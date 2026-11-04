// Refresh after change (djp 2026-11-03/04): a bare `nb:` annotation that tw2nb's on-exit hook
// swaps for the note's link (`nb tw note`, hooks off) during the same write must show on the
// List card after Save, without a reload. djp saw the link only after reloading. Here a stand-in
// on-exit hook does the swap (tw2nb itself needs nb); the plain annotation case is bug17's check.
const fs = require('fs'), path = require('path');
const { check, expect, B, sleep, exportOne } = require('./lib.cjs');

const HOOK = `#!/usr/bin/env python3
import json, subprocess, sys
for line in sys.stdin:
    try: t = json.loads(line)
    except ValueError: continue
    if any(a.get('description') == 'nb:' for a in t.get('annotations', [])):
        run = lambda *a: subprocess.run(['task', 'rc.hooks=off', 'rc.verbose=nothing', t['uuid'], *a],
                                        stdin=subprocess.DEVNULL, capture_output=True)
        run('denotate', '--', 'nb:')
        run('annotate', '--', 'nb: tasknotes:epsilon-note.md')
`;

check(async pg => {
    const rc = process.env.TASKRC, before = fs.readFileSync(rc, 'utf8');
    const hooks = path.join(path.dirname(rc), 'hooks');
    fs.rmSync(hooks, { recursive: true, force: true }); fs.mkdirSync(hooks);
    fs.writeFileSync(path.join(hooks, 'on-exit_swap.py'), HOOK, { mode: 0o755 });
    fs.writeFileSync(rc, before + `hooks=on\nhooks.location=${hooks}\n`);
    try {
        await pg.goto(B + '/');
        await pg.waitForSelector('.card-desc-text');
        const card = () => pg.locator('.task-card', { hasText: 'epsilon work secs' });
        await card().locator('.ca-edit').click();
        await pg.waitForSelector('#task-editor-save', { state: 'visible' });
        await pg.click('#te-ann-add-btn');
        await pg.locator('#te-ann-cm-host .cm-content, #te-ann-cm-host textarea').first().click();
        await pg.keyboard.type('nb:');
        await pg.click('#te-ann-save-btn');
        await sleep(1500);
        const anns = (exportOne('/epsilon/').annotations || []).map(a => a.description);
        if (!anns.includes('nb: tasknotes:epsilon-note.md')) throw new Error('the hook did not swap: ' + JSON.stringify(anns));
        const inEditor = await pg.locator('#task-editor-modal, .task-editor-modal, body').first().innerText();
        await pg.click('#task-editor-save');
        await sleep(800);
        const text = await card().innerText();
        expect(inEditor.includes('epsilon-note'), 'the editor does not show the hook\'s link after "Save note"');
        expect(text.includes('epsilon-note') && !/\bnb:\s*$/m.test(text),
               `the List card does not show the hook's link after Save: ${JSON.stringify(text)}`);
    } finally {
        fs.writeFileSync(rc, before); fs.rmSync(hooks, { recursive: true, force: true });
    }
});
