// Unit tests for tw-layers.js (TW.layers): day keys, spreading ranges over days, layer order,
// a failing layer. Run: node tests/js/tw-layers.test.cjs
process.env.TZ = 'America/Toronto';   // DST changes inside the tested ranges
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const calls = [];
const ctx = { TW: { api: { get: async url => { calls.push(url); return { success: true, holidays: [
    { start: '20261012', end: '20261012', title: 'Thanksgiving Day', type: 'V', region: 'ON', kind: 'holiday', at: '' },
    // 04:11 UTC: still the 25th in Toronto, whatever day tw-events wrote
    { start: '20261026', end: '20261026', title: 'Full Moon', type: '', region: '', kind: 'moon', at: '20261026T041142Z' },
    { start: '20261221', end: '20261221', title: 'December Solstice', type: '', region: '', kind: 'season', at: '20261221T205006Z' },
] }; } } },
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
    const m = L.byDay([
        { start: '20261012', title: 'Full moon', layer: 'moon' },
        { start: '20261012', title: 'Zed Day', layer: 'holidays' },
        { start: '20261001', title: 'Earlier', layer: 'moon' },
        { start: '20261012', title: 'Alpha Day', layer: 'holidays' },
    ]);
    eq([...m.keys()], ['20261001', '20261012']);
    eq(m.get('20261012').map(i => i.title), ['Alpha Day', 'Zed Day', 'Full moon']);
});

t('fetch: one request, three layers by kind; a moment falls on its local day', async () => {
    calls.length = 0;
    const items = await L.fetch('20261001', '20261231', {});
    eq(items.map(i => [i.layer, i.title, i.start, i.icon || '', i.time || '']), [
        ['holidays', 'Thanksgiving Day', '20261012', '', ''],
        ['moon', 'Full Moon', '20261026', '🌕', '00:11'],          // Toronto (EDT)
        ['seasons', 'December Solstice', '20261221', '☀️', '15:50'], // Toronto (EST)
    ]);
    eq(calls, ['/api/holidays?start=20261001&end=20261231']);
    eq(items[1].at, '2026-10-26T04:11:42.000Z');
});

t('each layer has its own switch', async () => {
    eq((await L.fetch('20261001', '20261231', { cal_moon: false, cal_seasons: false })).map(i => i.layer), ['holidays']);
    eq((await L.fetch('20261001', '20261231', { cal_holidays: false })).map(i => i.layer), ['moon', 'seasons']);
});

t('a failing layer gives nothing; the others still come', async () => {
    L.register({ id: 'broken', items: async () => { throw new Error('no'); } });
    eq((await L.fetch('20261001', '20261031', {})).map(i => i.layer), ['holidays', 'moon']);
});

t('one request per range per page, shared by the layers', async () => {
    calls.length = 0;
    await L.get('holidays').items('20261101', '20261130');
    await L.get('moon').items('20261101', '20261130');
    eq(calls, ['/api/holidays?start=20261101&end=20261130']);
});

(async () => {
    for (const [name, fn] of tests) {
        try { await fn(); n++; } catch (e) { console.error(`FAIL ${name}\n${e.message}`); process.exit(1); }
    }
    console.log(`tw-layers: ${n} passed`);
})();
