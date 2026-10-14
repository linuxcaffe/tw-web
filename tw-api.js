/**
 * tw-web shared data layer: one task cache and one way to write, for every page.
 * Load right after nav.js on every page (check-refs.py enforces it wherever TW is used).
 *
 *   TW.store.read(name, match, ttl?)  cached entry or null; name: 'tasks' | 'extras' | 'total'
 *   TW.store.save(name, value)        stamp and store an entry
 *   TW.store.invalidate()             forget every cached task list (after any write)
 *   TW.api.get(url)                   GET, parsed JSON
 *   TW.api.write(method, url, body?)  POST/PUT/DELETE, parsed JSON; always invalidates the cache
 *
 * Every write that can change tasks goes through TW.api.write, so no page has to remember to
 * invalidate. A write that never got an answer still invalidates: it may have reached the server.
 * Failures come back as {success: false, error}, never as a thrown error.
 */
const TW = (() => {
    'use strict';

    // sessionStorage: shared by the views in this tab, gone with it.
    const KEYS = { tasks: 'tw-tasks-cache', extras: 'tw-cal-extras', total: 'tw-grand-total' };
    const TTL = 30_000;

    function read(name, match, ttl = TTL) {
        try {
            const x = JSON.parse(sessionStorage.getItem(KEYS[name]));
            if (x && Date.now() - x.ts < ttl && match(x)) return x;
        } catch {}
        return null;
    }

    function save(name, value) {
        try { sessionStorage.setItem(KEYS[name], JSON.stringify({ ...value, ts: Date.now() })); } catch {}
    }

    function invalidate() {
        for (const key of Object.values(KEYS)) {
            try { sessionStorage.removeItem(key); } catch {}
        }
    }

    async function get(url) {
        const r = await fetch(url);
        return r.json();
    }

    async function write(method, url, body) {
        const opts = { method };
        if (body !== undefined) {
            opts.headers = { 'Content-Type': 'application/json' };
            opts.body = JSON.stringify(body);
        }
        let r;
        try {
            r = await fetch(url, opts);
        } catch (e) {
            invalidate();
            return { success: false, error: 'Network error: ' + e.message };
        }
        invalidate();
        try {
            return await r.json();
        } catch {
            return { success: false, error: `Bad response from server (HTTP ${r.status})` };
        }
    }

    return { store: { read, save, invalidate }, api: { get, write } };
})();
