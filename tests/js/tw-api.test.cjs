// Unit tests for TW.commands in tw-api.js (command mode's command words, bug 9).
// Run: node tests/js/tw-api.test.cjs (tests/test_js.py runs it from pytest).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {}, sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} } };
vm.createContext(ctx);
// tw-api.js declares `const TW`, which a vm context doesn't expose: hand it back explicitly
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'tw-api.js'), 'utf8') + '\nthis.TW = TW;', ctx);
const C = ctx.TW.commands;

// A slice of `task _commands` / `_aliases` on 2.6.2 (2026-10-15), plus a custom report 'mine'
const V = {
    commands: ['_get', 'add', 'columns', 'commands', 'completed', 'config', 'context', 'count',
               'delete', 'done', 'information', 'list', 'log', 'long', 'ls', 'mine', 'modify',
               'prepend', 'projects', 'synchronize', 'undo'],
    aliases: ['burndown', 'rm'],
    abbreviation_minimum: 2,
};
let n = 0;
function t(name, fn) { fn(); n++; }

t('full names and aliases are commands', () => {
    for (const w of ['add', 'mine', 'list', 'burndown', 'rm', 'MODIFY', '_get']) assert.ok(C.isCommandWord(w, V), w);
});
t('a unique prefix at least abbreviation.minimum long is a command', () => {
    for (const w of ['mo', 'mod', 'info', 'sync', 'proj', 'do', 'un', 'de']) assert.ok(C.isCommandWord(w, V), w);
});
t('ambiguous or too short is not', () => {
    for (const w of ['co', 'com', 'l', 'lo', 'p', 'r']) assert.ok(!C.isCommandWord(w, V), w);
});
t('an alias matches only by its full name', () => assert.ok(!C.isCommandWord('burn', V)));
t('abbreviation.minimum is respected', () => {
    assert.ok(!C.isCommandWord('mod', { ...V, abbreviation_minimum: 4 }));
    assert.ok(C.isCommandWord('modi', { ...V, abbreviation_minimum: 4 }));
});
t('filters are not commands', () => {
    for (const w of ['project:work', '+next', 'due.before:eow', 'description.has:x', 'milk']) {
        assert.ok(!C.isCommandWord(w, V), w);
    }
});

t('isFilterOnly: no command word anywhere', () => {
    assert.ok(C.isFilterOnly('project:work +next', V));
    assert.ok(C.isFilterOnly('co', V));
    assert.ok(!C.isFilterOnly('project:work mine', V));
    assert.ok(!C.isFilterOnly('  +next   mod  pri:H', V));
});
t('isFilterOnly: a leading ID or ID list is a command', () => {
    for (const c of ['12', '3-5,7 done', '12 +x']) assert.ok(!C.isFilterOnly(c, V), c);
});
t('isFilterOnly: without the vocabulary, the console decides', () => assert.ok(!C.isFilterOnly('project:work', null)));


// ── TW.api.networkError: "Failed to fetch" says what happened (step 7, item 1) ─
const checks = [];
ctx.document = { dispatchEvent(ev) { checks.push(ev.type); } };
ctx.CustomEvent = class { constructor(type) { this.type = type; } };
const A = ctx.TW.api;
function err(name, message) { const e = new Error(message); e.name = name; return e; }

t('no answer (Chrome, Firefox, Safari): the server isn\'t answering, and nav.js is asked to check', () => {
    for (const m of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed']) {
        assert.strictEqual(A.networkError(err('TypeError', m)), "tw-web server isn't answering");
    }
    assert.deepStrictEqual(checks, ['tw-server-check', 'tw-server-check', 'tw-server-check']);
});
t('a timeout and other errors keep their own words, and ask for no check', () => {
    checks.length = 0;
    assert.strictEqual(A.networkError(err('AbortError', 'aborted')), 'No answer from the server in time');
    assert.strictEqual(A.networkError(err('SyntaxError', 'bad JSON')), 'Network error: bad JSON');
    assert.deepStrictEqual(checks, []);
});

console.log(`tw-api commands: ${n} passed`);
