// Unit tests for tw-layers.js (TW.layers): day keys, spreading ranges over days, layer order,
// a failing layer. Run: node tests/js/tw-layers.test.cjs
process.env.TZ = 'America/Toronto';   // DST changes inside the tested ranges
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const calls = [];
const ctx = { TW: { api: { get: async url => { calls.push(url); return { success: true, holidays: [
    { start: '20261012', end: '20261012', title: 'Thanksgiving Day', type: 'V', region: 'ON' }] }; } } },
    Date, Math, Promise, console: { warn() {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'tw-layers.js'), 'utf8'), ctx);
const L = ctx.TW.layers;
let n = 0;
const tests = [];
function t(name, fn) { tests.push([name, fn]); }
const eq = (got, want) => assert.deepStrictEqual(JSON.parse(JSON.stringify(got)), want);   // vm arrays are another realm's

t('addDays crosses months, years and DST', () => {
    assert.strictEqual(L.addDays('20261031', 1), '20261101');
    assert.strictEqual(L.addDays('20261101', 1), '20261102');   // DST ends in Toronto
    assert.strictEqual(L.addDays('20261231', 1), '20270101');
    assert.strictEqual(L.addDays('20260301', -1), '20260228');
});

t('byDay spreads a range over its days, clipped', () => {
    const m = L.byDay([{ start: '20261224', end: '20261226', title: 'Break', layer: 'holidays' }], '20261225', '20261231');
    eq([...m.keys()], ['20261225', '20261226']);
});

t('byDay orders days, then layers by registration, then titles', () => {
    L.register({ id: 'moon', items: async () => [] });
    const m = L.byDay([
        { start: '20261012', title: 'Full moon', layer: 'moon' },
        { start: '20261012', title: 'Zed Day', layer: 'holidays' },
        { start: '20261001', title: 'Earlier', layer: 'moon' },
        { start: '20261012', title: 'Alpha Day', layer: 'holidays' },
    ]);
    eq([...m.keys()], ['20261001', '20261012']);
    eq(m.get('20261012').map(i => i.title), ['Alpha Day', 'Zed Day', 'Full moon']);
});

t('fetch: enabled layers only, each item tagged; a failing layer gives nothing', async () => {
    L.register({ id: 'moon', items: async () => { throw new Error('no moon'); } });
    const items = await L.fetch('20261001', '20261031', {});
    eq(items.map(i => [i.layer, i.title, i.detail, i.end]),
           [['holidays', 'Thanksgiving Day', 'ON · V', '20261012']]);
    eq(await L.fetch('20261001', '20261031', { cal_holidays: false }), []);
});

t('holidays: one request per range per page', async () => {
    calls.length = 0;
    await L.get('holidays').items('20261101', '20261130');
    await L.get('holidays').items('20261101', '20261130');
    eq(calls, ['/api/holidays?start=20261101&end=20261130']);
});

(async () => {
    for (const [name, fn] of tests) {
        try { await fn(); n++; } catch (e) { console.error(`FAIL ${name}\n${e.message}`); process.exit(1); }
    }
    console.log(`tw-layers: ${n} passed`);
})();
