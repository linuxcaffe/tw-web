/**
 * tw-web shared data layer: one task cache and one way to write, for every page.
 * Load right after nav.js on every page (check-refs.py enforces it wherever TW is used).
 *
 *   TW.store.read(name, match, ttl?)  cached entry or null; name: 'tasks' | 'extras' | 'total'
 *   TW.store.save(name, value)        stamp and store an entry
 *   TW.store.invalidate()             forget every cached task list (after any write)
 *   TW.api.get(url)                   GET, parsed JSON
 *   TW.api.write(method, url, body?)  POST/PUT/DELETE, parsed JSON; always invalidates the cache
 *   TW.api.handleWriteResult(data)    act on a write's hook signals; returns true if the PTY took over
 *   TW.commands.vocab()               task's commands and aliases (/api/commands), fetched once per page
 *   TW.commands.isFilterOnly(cmd, v)  command mode: true when cmd has no command word (a raw filter)
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

    // The signals a write result can carry (app.py _hook_signals), handled the same way wherever
    // the write came from. Returns true when a hook asked for a terminal and the PTY console took
    // over, so the caller should do nothing else. cmd is what follows `task`; a spooled command
    // is a shell command line (CONVENTIONS §3).
    function handleWriteResult(data) {
        if (data.needs_pty) { window.twNav?.openPty(data.cmd); return true; }
        if (data.deferred_cmd) window.twTerminal?.offerTerminal(data.deferred_cmd, { kind: 'shell' });
        if (data.timed_out && data.cmd) {
            window.twTerminal?.offerTerminal(data.cmd, { kind: 'task', title: 'Timed out — run in terminal?' });
        }
        return false;
    }

    // ── Command mode's vocabulary (bug 9) ─────────────────────────────────────
    let _vocab = null;
    async function vocab() {
        if (!_vocab) {
            const d = await get('/api/commands');
            if (!d.success) return null;
            _vocab = d;
        }
        return _vocab;
    }

    // Is tok a command word, as task 2.6.2 reads one? An alias or a command by its full name, or
    // a prefix of exactly one command at least abbreviation.minimum long ('co' is ambiguous).
    function isCommandWord(tok, v) {
        const t = tok.toLowerCase();
        if (v.aliases.includes(t) || v.commands.includes(t)) return true;
        if (t.length < v.abbreviation_minimum) return false;
        return v.commands.filter(c => c.startsWith(t)).length === 1;
    }

    // A leading task ID ("12", "3-5,7") means a command too. Without the vocabulary (v null),
    // say no: the console runs it and task decides.
    function isFilterOnly(cmd, v) {
        const tokens = cmd.trim().split(/\s+/);
        if (/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(tokens[0])) return false;
        if (!v) return false;
        return !tokens.some(tok => isCommandWord(tok, v));
    }

    return { store: { read, save, invalidate }, api: { get, write, handleWriteResult },
             commands: { vocab, isCommandWord, isFilterOnly } };
})();
