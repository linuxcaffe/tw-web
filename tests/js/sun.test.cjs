// Unit tests for sun.js (TW.sun): sunrise, sunset and civil twilight, as minutes after local
// midnight, against published Toronto times (43.65, -79.38). Run: node tests/js/sun.test.cjs
process.env.TZ = 'America/Toronto';   // before any Date: local clock, DST and all
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { TW: {}, Date, Math };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'sun.js'), 'utf8'), ctx);
const S = ctx.TW.sun;
let n = 0;
function t(name, fn) { fn(); n++; }
const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
function near(got, want, what, tol = 6) {
    assert.ok(Math.abs(got - hm(want)) <= tol,
        `${what}: ${Math.floor(got / 60)}:${String(Math.round(got % 60)).padStart(2, '0')}, want ${want}`);
}
const TOR = [43.65, -79.38];

t('winter solstice (EST)', () => {
    const s = S.times(new Date(2026, 11, 21), ...TOR);
    near(s.dawn, '7:15', 'dawn'); near(s.sunrise, '7:47', 'sunrise');
    near(s.sunset, '16:43', 'sunset'); near(s.dusk, '17:15', 'dusk');
});
t('summer solstice (EDT: solar noon after 13:00)', () => {
    const s = S.times(new Date(2026, 5, 21), ...TOR);
    near(s.dawn, '5:01', 'dawn'); near(s.sunrise, '5:36', 'sunrise');
    near(s.sunset, '21:03', 'sunset'); near(s.dusk, '21:38', 'dusk');
});
t('equinox', () => {
    const s = S.times(new Date(2026, 2, 20), ...TOR);
    near(s.sunrise, '7:22', 'sunrise'); near(s.sunset, '19:32', 'sunset');
});
t('midnight sun (Ellesmere, Eastern time): never dark', () => {
    const s = S.times(new Date(2026, 5, 21), 80, -75);
    assert.ok(s.dawn === 0 && s.dusk === 1440, JSON.stringify(s));
});
t('polar night: no daylight', () => {
    const s = S.times(new Date(2026, 11, 21), 80, -75);
    assert.ok(s.sunrise === s.sunset, JSON.stringify(s));
});
t('tint: 0 at night, 1 in daylight, ramps through twilight', () => {
    const s = { dawn: 400, sunrise: 440, sunset: 1000, dusk: 1040 };
    assert.strictEqual(S.tint(300, s), 0);
    assert.strictEqual(S.tint(420, s), 0.5);
    assert.strictEqual(S.tint(700, s), 1);
    assert.strictEqual(S.tint(1030, s), 0.25);
    assert.strictEqual(S.tint(1100, s), 0);
});
console.log(`sun: ${n} passed`);
