// tw-web — calendar layers: things that aren't tasks (holidays, the moon's phases, the seasons), drawn by the
// Calendar and the Agenda, never edited, never counted, untouched by the nav filter.
// Loads after tw-api.js, which declares TW. Plan: tw:docs/tw-holidays-and-layers-plan.md.
//
//   TW.layers.register({ id, label, enabled(cfg), makesBars, items(start, end) })
//       items: start/end 'YYYYMMDD' (inclusive) → Promise of [{ start, end, title, detail?,
//              at? (a moment: Date), time? ('HH:MM' local), icon? }]
//       makesBars: the Agenda gives the layer's days a date line even with no tasks
//   TW.layers.fetch(start, end, cfg)   every enabled layer's items, each with its layer id;
//                                      a layer that fails gives none (and says so in the console)
//   TW.layers.byDay(items, from?, to?) Map 'YYYYMMDD' → items, ranges spread over their days
//   TW.layers.addDays(key, n), dayKey(date)
//
// The helpers are pure: tests/js/tw-layers.test.cjs runs them in Node.
TW.layers = (() => {
    const layers = [];

    function dayKey(d) {
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    }
    function parseKey(key) {
        return new Date(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8), 12);   // noon: DST-proof
    }
    function addDays(key, n) {
        const d = parseKey(key);
        d.setDate(d.getDate() + n);
        return dayKey(d);
    }

    function register(layer) {
        const i = layers.findIndex(l => l.id === layer.id);
        if (i >= 0) layers[i] = layer; else layers.push(layer);
    }
    function get(id) { return layers.find(l => l.id === id) || null; }
    function enabled(cfg) { return layers.filter(l => !l.enabled || l.enabled(cfg || {})); }

    async function fetch(start, end, cfg) {
        const lists = await Promise.all(enabled(cfg).map(l =>
            Promise.resolve().then(() => l.items(start, end)).then(
                items => (items || []).map(it => ({ ...it, end: it.end || it.start, layer: l.id })),
                err => { console.warn(`[layers] ${l.id}:`, err); return []; })));
        return lists.flat();
    }

    // Map day → items. Days in registration order of their layers, then by title; clipped to from..to.
    function byDay(items, from, to) {
        const order = id => { const i = layers.findIndex(l => l.id === id); return i < 0 ? layers.length : i; };
        const sorted = [...items].sort((a, b) => order(a.layer) - order(b.layer) || String(a.title).localeCompare(String(b.title)));
        const out = new Map();
        for (const it of sorted) {
            let k = from && it.start < from ? from : it.start;
            const last = to && (it.end || it.start) > to ? to : (it.end || it.start);
            for (let guard = 0; k <= last && guard < 400; guard++, k = addDays(k, 1)) {
                if (!out.has(k)) out.set(k, []);
                out.get(k).push(it);
            }
        }
        return new Map([...out.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }

    return { register, get, enabled, fetch, byDay, addDays, dayKey };
})();

// ── The taskrc's holiday.* entries (/api/holidays; tw-events writes them) ──────────────────────
// One request per range per page, split into layers by kind: holidays (all-day, amber, and the
// Agenda gives them lines of their own), the moon's phases and the seasons (moments: .at, UTC,
// shown on their local day with a time and an icon; they only annotate existing Agenda lines).
(() => {
    const memo = new Map();   // 'start-end' → Promise of the route's entries
    function entries(start, end) {
        const k = `${start}-${end}`;
        if (!memo.has(k)) {
            memo.set(k, TW.api.get(`/api/holidays?start=${start}&end=${end}`).then(d => {
                if (!d.success) throw new Error(d.error || 'holidays');
                return d.holidays;
            }).catch(err => { memo.delete(k); throw err; }));
        }
        return memo.get(k);
    }
    // 20261026T041142Z → Date
    const moment = at => {
        const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(at || '');
        return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
    };
    const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const ICONS = { 'New Moon': '🌑', 'First Quarter': '🌓', 'Full Moon': '🌕', 'Last Quarter': '🌗' };
    const icon = h => ICONS[h.title] || (/Solstice/.test(h.title) ? '☀️' : /Equinox/.test(h.title) ? '⚖️' : '');

    function layer(id, label, kind, setting, makesBars) {
        TW.layers.register({
            id, label, makesBars,
            enabled: cfg => cfg[setting] !== false,
            async items(start, end) {
                return (await entries(start, end)).filter(h => (h.kind || 'holiday') === kind).flatMap(h => {
                    const at = moment(h.at);
                    if (!at) return [{ start: h.start, end: h.end, title: h.title,
                                       detail: [h.region, h.type].filter(Boolean).join(' · ') }];
                    const day = TW.layers.dayKey(at);           // the browser's day, not the writer's
                    if (day < start || day > end) return [];
                    return [{ start: day, end: day, title: h.title, at, time: hhmm(at), icon: icon(h),
                              detail: `${hhmm(at)}` }];
                });
            },
        });
    }
    layer('holidays', 'Holidays', 'holiday', 'cal_holidays', true);
    layer('moon',     'Moon',     'moon',    'cal_moon',     false);
    layer('seasons',  'Seasons',  'season',  'cal_seasons',  false);
})();
