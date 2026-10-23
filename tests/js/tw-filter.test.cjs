// Unit tests for tw-filter.js (TW.filter, TW.sort). Run: node tests/js/tw-filter.test.cjs
// tests/test_js.py runs this from pytest, so the pre-commit hook covers it.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { TW: {}, window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'tw-filter.js'), 'utf8'), ctx);
const { filter: F, sort: S, recur: R } = ctx.TW;

// Arrays made inside the vm context have another Array prototype: compare as JSON
const eq = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
let n = 0;
function t(name, fn) { fn(); n++; }

const tasks = [
    { description: 'Buy milk',   project: 'home',      priority: 'H', tags: ['shop'] },
    { description: 'Write spec', project: 'work.docs', priority: '2', tags: [] },
    { description: 'Call Bob',   project: '',          priority: '',  tags: ['phone', 'shop'] },
    { description: 'File taxes', project: 'home.tax',  priority: 'L' },
];
const pick = state => tasks.filter(x => F.matchesNav(x, state)).map(x => x.description);

t('empty state keeps everything', () => eq(pick({}).length, 4));
t('description contains, any case', () => eq(pick({ filter: 'MILK' }), ['Buy milk']));
t('project contains', () => eq(pick({ project: 'home' }), ['Buy milk', 'File taxes']));
t('project .none:', () => eq(pick({ project: '.none:' }), ['Call Bob']));
t('project .is:', () => eq(pick({ project: '.is:home' }), ['Buy milk']));
t('project .startswith:', () => eq(pick({ project: '.startswith:work' }), ['Write spec']));
t('project unknown modifier matches nothing', () => eq(pick({ project: '.bogus:x' }), []));
t('priority is exact', () => eq(pick({ priority: 'h' }), ['Buy milk']));
// Read literally (user, 2026-10-15): "> M" is "higher priority than M"
t('priority > M is higher than M', () => eq(pick({ priority: '> M' }), ['Buy milk', 'Write spec']));
t('priority < H is lower than H', () => eq(pick({ priority: '< H' }), ['File taxes']));
t('priority > 3 is 1 and 2', () => eq(['1','2','3','4','H'].filter(p => F.matchAttr(p, '> 3', 'ord')), ['1','2']));
t('priority .any:', () => eq(pick({ priority: '.any:' }).length, 3));
t('priority .contains: is not an ordered modifier', () => eq(pick({ priority: '.contains:H' }), []));
t('tags: all listed must be present', () => eq(pick({ tags: 'shop, phone' }), ['Call Bob']));
t('tags .none: keeps untagged (bug 8)', () => eq(pick({ tags: '.none:' }), ['Write spec', 'File taxes']));
t('tags .any:', () => eq(pick({ tags: '.any:' }), ['Buy milk', 'Call Bob']));
t('tags .hasnt:', () => eq(pick({ tags: '.hasnt:shop' }), ['Write spec', 'File taxes']));
t('all inputs combine', () => eq(pick({ project: 'home', tags: 'shop', priority: 'H' }), ['Buy milk']));
t('navTasks without twNav keeps everything', () => assert.strictEqual(F.navTasks(tasks).length, 4));
t('navTasks reads twNav.getState()', () => {
    ctx.window.twNav = { getState: () => ({ project: 'work' }) };
    try { eq(F.navTasks(tasks).map(x => x.description), ['Write spec']); }
    finally { delete ctx.window.twNav; }
});

// Virtual tags (+DUE, -BLOCKED…): task decides who matches (/api/vtags); TW.filter holds the answer
const vt = [
    { uuid: 'u1', description: 'Late rent',  tags: ['home'] },
    { uuid: 'u2', description: 'Blocked',    tags: ['work'] },
    { uuid: 'u3', description: 'Free',       tags: [] },
];
const V = { names: ['DUE', 'OVERDUE', 'BLOCKED'], sets: { OVERDUE: ['u1'], BLOCKED: ['u2'] } };
const vpick = (tags, v = V) => vt.filter(x => F.matchesNav(x, { tags }, v)).map(x => x.description);
t('tags +x is the same as x', () => eq(pick({ tags: '+shop' }), ['Buy milk', 'Call Bob']));
t('tags -x excludes x', () => eq(pick({ tags: '-shop' }), ['Write spec', 'File taxes']));
t('tags: +x -y combine, space or comma', () => {
    eq(pick({ tags: '+shop -phone' }), ['Buy milk']);
    eq(pick({ tags: 'shop,-phone' }), ['Buy milk']);
});
t('virtual tag matches the uuids task gave', () => eq(vpick('OVERDUE'), ['Late rent']));
t('+virtual is the same', () => eq(vpick('+OVERDUE'), ['Late rent']));
t('-virtual excludes them', () => eq(vpick('-BLOCKED'), ['Late rent', 'Free']));
t('.has: and .hasnt: take a virtual tag', () => {
    eq(vpick('.has:BLOCKED'), ['Blocked']);
    eq(vpick('.hasnt:BLOCKED'), ['Late rent', 'Free']);
});
t('virtual and real tags combine', () => eq(vpick('home OVERDUE'), ['Late rent']));
t('a known virtual tag not fetched yet matches nothing', () => eq(vpick('DUE'), []));
t('virtual tags are upper case: lower case is a real tag', () => eq(vpick('overdue'), []));
t('without the names, an upper-case word is a real tag', () =>
    eq(F.matchTags(['OVERDUE'], 'OVERDUE', { uuid: 'x' }, { names: [], sets: {} }), true));
t('virtualTerms: the virtual names an input uses', () => {
    eq(F.virtualTerms('home +DUE -BLOCKED,work', V), ['DUE', 'BLOCKED']);
    eq(F.virtualTerms('.hasnt:OVERDUE', V), ['OVERDUE']);
    eq(F.virtualTerms('.none:', V), []);
});
t('tagTerms: the positive terms, for the sidebar highlight', () =>
    eq(F.tagTerms('home, +DUE -BLOCKED'), ['home', 'DUE']));
t('navTasks uses the virtual tags set with setVirtual', () => {
    ctx.window.twNav = { getState: () => ({ tags: '-BLOCKED' }) };
    F.setVirtual(V);
    try { eq(F.navTasks(vt).map(x => x.description), ['Late rent', 'Free']); }
    finally { delete ctx.window.twNav; F.setVirtual({ names: [], sets: {} }); }
});

const D = state => JSON.parse(JSON.stringify(F.addDefaults(state)));
t('addDefaults: plain values become defaults', () =>
    eq(D({ project: 'home.garden', priority: 'h', tags: 'next, errand', filter: 'milk' }),
       { project: 'home.garden', priority: 'H', tags: ['next', 'errand'] }));
t('addDefaults: .is: and .has: name one value', () =>
    eq(D({ project: '.is:work', priority: '.is:2', tags: '.has:phone' }), { project: 'work', priority: '2', tags: ['phone'] }));
t('addDefaults: ranges and negatives give nothing', () =>
    eq(D({ project: '.none:', priority: '< M', tags: '.hasnt:x' }), {}));
t('addDefaults: other modifiers give nothing', () =>
    eq(D({ project: '.startswith:wo', priority: '.any:', tags: '.any:' }), {}));
t('addDefaults: + tags count, - tags and virtual tags do not', () => {
    F.setVirtual(V);
    try { eq(D({ tags: '+errand -phone DUE' }), { tags: ['errand'] }); }
    finally { F.setVirtual({ names: [], sets: {} }); }
});
t('addDefaults: an empty state gives nothing', () => eq(D({}), {}));
t('addDefaults: an unknown priority is not a default', () => eq(D({ priority: 'Z' }), {}));

t('priRank: 1 highest, then 2…6, H, M, L, none 0', () => {
    const ranks = ['1','2','3','4','5','6','H','M','L',''].map(S.priRank);
    eq(ranks, [9,8,7,6,5,4,3,2,1,0]);
    assert.strictEqual(S.priRank('h'), 3);
    assert.strictEqual(S.priRank('X'), 0);
});
const desc = list => list.map(x => x.description);
t('sort priority reversed: highest first, 1–6 above H (bug 12)', () =>
    eq(desc(S.tasks(tasks, 'priority', true)), ['Write spec', 'Buy milk', 'File taxes', 'Call Bob']));
t('sort priority ascending: none first', () =>
    eq(desc(S.tasks(tasks, 'priority', false)), ['Call Bob', 'File taxes', 'Buy milk', 'Write spec']));
t('sort urgency keeps server order, or reverses it', () => {
    assert.strictEqual(S.tasks(tasks, 'urgency', false), tasks);
    eq(desc(S.tasks(tasks, 'urgency', true)), desc(tasks).reverse());
});
t('sort does not mutate its input', () => {
    const before = desc(tasks);
    S.tasks(tasks, 'description', false);
    eq(desc(tasks), before);
});
t('sort tags joins them; missing sorts first', () =>
    eq(desc(S.tasks(tasks, 'tags', false)), ['Write spec', 'File taxes', 'Call Bob', 'Buy milk']));

// TW.recur: recurrence-overhaul's template and instance, and built-in 2.6.2's parent and child
t('recur: template is status:recurring', () => eq(R.kind({ status: 'recurring', r: 'P30D' }), 'template'));
t('recur: overhaul instance has rtemplate', () => eq(R.kind({ status: 'pending', rtemplate: 'c54a' }), 'instance'));
t('recur: built-in child has parent', () => eq(R.kind({ status: 'waiting', parent: 'c54a', imask: 3 }), 'instance'));
t('recur: a done instance is still one', () => eq(R.kind({ status: 'completed', rtemplate: 'c54a' }), 'instance'));
t('recur: plain task is neither', () => eq(R.kind({ status: 'pending' }), ''));

// TW.recur offsets: a template's rwait/runtil/rscheduled shown as dates, and a picked date saved back
const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const od = (y, mo, d, expr) => { const r = R.offsetDate(new Date(y, mo - 1, d, 9, 0), expr); return r && r.getTime(); };
t('offset: seconds, as the hook writes them', () => eq(od(2030, 1, 31, 'due-604800s'), at(2030, 1, 24, 9)));
t('offset: days and hours', () => { eq(od(2030, 1, 31, 'sched-3d'), at(2030, 1, 28, 9)); eq(od(2030, 1, 31, 'due+2h'), at(2030, 1, 31, 11)); });
t('offset: minutes, m or min', () => { eq(od(2030, 1, 31, 'due-90min'), at(2030, 1, 31, 7, 30)); eq(od(2030, 1, 31, 'due-30m'), at(2030, 1, 31, 8, 30)); });
t('offset: months by the calendar, clamped', () => { eq(od(2030, 3, 31, 'due-1mo'), at(2030, 2, 28, 9)); eq(od(2030, 1, 31, 'due+1mo'), at(2030, 2, 28, 9)); });
t('offset: years by the calendar', () => eq(od(2028, 2, 29, 'due+1y'), at(2029, 2, 28, 9)));
t('offset: weeks', () => eq(od(2030, 1, 31, 'due-2w'), at(2030, 1, 17, 9)));
t('offset: not an offset', () => { eq(od(2030, 1, 31, '20300101T000000Z'), null); eq(od(2030, 1, 31, ''), null); });
t('offset expr: seconds from the anchor, signed', () => {
    eq(R.offsetExpr('due', new Date(2030, 0, 31, 9), new Date(2030, 0, 24, 9)), 'due-604800s');
    eq(R.offsetExpr('sched', new Date(2030, 0, 31, 9), new Date(2030, 0, 31, 11)), 'sched+7200s');
});
t('anchor name: ranchor sched, else due', () => { eq(R.anchorName({ ranchor: 'sched' }), 'sched'); eq(R.anchorName({ ranchor: 'due' }), 'due'); eq(R.anchorName({}), 'due'); });

console.log(`tw-filter: ${n} passed`);
