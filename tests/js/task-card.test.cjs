// Unit tests for TaskCardManager._extras in task-card.js: the card's metadata line.
// It starts with id: (uuid/end once done), ends with urgency:, and leaves out what is shown
// above it or is a hook's bookkeeping (edate, recurrence-overhaul's r* fields).
// Run: node tests/js/task-card.test.cjs (tests/test_js.py runs it from pytest).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {}, document: { addEventListener() {} },
              TW: { recur: { kind: () => '' }, nbHealth: () => Promise.resolve({}) } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'task-card.js'), 'utf8')
                + '\nthis.TaskCardManager = TaskCardManager;', ctx);
const m = Object.create(ctx.TaskCardManager.prototype);
const x = t => m._extras(t);

// A recurring template: rule only, no internals; urgency last
assert.strictEqual(x({ id: 6, status: 'recurring', urgency: 33.61, amt: '107.00', edate: '20270131T050000Z',
    r: '1mo', ranchor: 'due', rlast: '11', rtype: 'periodic', rwait: 'due-604800s', type: 'period',
    due: '20270131T050000Z', mask: '---' }),
    'id:6, r:1mo, amt:107.00, urgency:33.6');

// A chain template with an end
const chain = x({ id: 19, status: 'recurring', urgency: 2, r: 'P30D', type: 'chain', rend: '20270501T040000Z' });
assert.match(chain, /^id:19, r:P30D, type:chain, rend:May 1(, 2027)?, urgency:2$/);

// An instance: wait before the instance number; rtemplate hidden
const inst = x({ id: 68, status: 'pending', urgency: 27, wait: '20261124T050000Z', rindex: '11',
    rtemplate: 'c54a475b-444d-aca9-72ba-1f636435aaaa', amt: '107.00', edate: '20270131T050000Z' });
assert.match(inst, /^id:68, wait:Nov 2[34], rindex:11, amt:107\.00, urgency:27$/);

// Other UDAs A–Z, but urgency still last even though it sorts before 'wait'
assert.strictEqual(x({ id: 51, status: 'pending', urgency: 30.9, state: 'todo', due_duration: 'PT2H30M', zz: 'a' }),
    'id:51, due_duration:PT2H30M, state:todo, zz:a, urgency:30.9');

// Done: uuid and end first, no id
assert.match(x({ id: 0, status: 'completed', uuid: 'abcdef12-0000-0000-0000-000000000000',
    end: '20261101T120000Z', urgency: 1 }), /^uuid:abcdef12, end:Nov 1, 2026, urgency:1$/);

// The Agenda's working fields (_at is a Date: it printed with a timezone) never show
assert.strictEqual(x({ id: 13, status: 'pending', urgency: 31.5, state: 'todo',
    _at: new Date(2026, 10, 8, 11, 30), _type: 'due', _sort: '2026-11-08T16:30:00.000Z' }),
    'id:13, state:todo, urgency:31.5');

console.log('task-card: ok');
