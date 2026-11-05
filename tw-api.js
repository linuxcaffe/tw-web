/**
 * tw-web shared data layer: one task cache and one way to write, for every page.
 * Load right after nav.js on every page (check-refs.py enforces it wherever TW is used).
 *
 *   TW.store.read(name, match, ttl?)  cached entry or null; name: 'tasks' | 'extras' | 'total' | 'vtags'
 *   TW.store.save(name, value)        stamp and store an entry
 *   TW.store.invalidate()             forget every cached task list (after any write)
 *   TW.api.get(url)                   GET, parsed JSON
 *   TW.api.write(method, url, body?)  POST/PUT/DELETE, parsed JSON; always invalidates the cache
 *   TW.api.handleWriteResult(data)    act on a write's hook signals; returns true if the PTY took over
 *   TW.api.networkError(e)            the message for a fetch that threw; when nothing answered, says
 *                                     so and asks nav.js to check the server (its banner)
 *   TW.stamp.seen() / .set(s)         the task data's state this page has (X-Tasks-Stamp, bug 19):
 *                                     nav.js reloads the view when the server's moves past it
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
    const KEYS = { tasks: 'tw-tasks-cache', extras: 'tw-cal-extras', total: 'tw-grand-total',
                   vtags: 'tw-vtags-cache' };
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

    let _seen = null;
    const stamp = { seen: () => _seen, set: s => { _seen = s; } };

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
            return { success: false, error: networkError(e) };
        }
        invalidate();
        const st = r.headers.get('X-Tasks-Stamp');   // our own write: not news to this page
        if (st) _seen = st;
        try {
            return await r.json();
        } catch {
            return { success: false, error: `Bad response from server (HTTP ${r.status})` };
        }
    }

    // fetch throws a TypeError when nothing answered ("Failed to fetch", "NetworkError when attempting
    // to fetch resource", "Load failed"): the server has stopped, or (Tailscale) can't be reached.
    // The browser's own words say neither, so say it, and let nav.js check and show its banner.
    const NO_ANSWER = "tw-web server isn't answering";
    function networkError(e) {
        if (e && e.name === 'TypeError') {
            if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('tw-server-check'));
            return NO_ANSWER;
        }
        if (e && e.name === 'AbortError') return 'No answer from the server in time';
        return 'Network error: ' + (e && e.message || e);
    }

    // The signals a write result can carry (app.py _hook_signals), handled the same way wherever
    // the write came from. Returns true when a hook asked for a terminal and the PTY console took
    // over, so the caller should do nothing else. cmd is what follows `task`; a spooled command
    // is a shell command line (CONVENTIONS §3). A hook's reason (reason, deferred_reason), when it
    // gave one, titles the console or the offer.
    function handleWriteResult(data) {
        if (data.needs_pty) { window.twNav?.openPty(data.cmd, { reason: data.reason }); return true; }
        if (data.deferred_cmd) {
            window.twTerminal?.offerTerminal(data.deferred_cmd,
                { kind: 'shell', ...(data.deferred_reason ? { title: data.deferred_reason } : {}) });
        }
        if (data.timed_out && data.cmd) {
            window.twTerminal?.offerTerminal(data.cmd, { kind: 'task', title: 'Timed out — run in terminal?' });
        }
        return false;
    }

    // ── What of nb is here (tw-nb-interop M7 a, djp 2026-11-04) ───────────────
    // One answer, one wording, asked before acting: the server says what's on its host (nb, the
    // nb-plugin tw, tasknotes, the ~/.task/notes link, termux-open); nb-web's reachability is
    // probed from here, since the `nb` launcher is the browser's address (over Tailscale, say).
    // Any answer means up, a login page too. Cached 30 s.
    const NB_MISSING = {
        down:   "nb-web isn't reachable",
        unset:  "nb-web isn't set up here (the nb annotation launcher)",
        nb:     "nb isn't installed here",
        plugin: "nb's tw plugin isn't installed here",
        notes:  "the task notes aren't on this device",
    };
    let _nbHealth = null, _nbHealthAt = 0;
    async function _probeNbWeb(url) {
        if (!url) return 'unset';
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 2500);   // Tailscale: 0.6-0.7 s from s5
        try {
            const u = new URL(url, location.href);
            const same = u.origin === location.origin;
            // no-cors allows only redirect: 'follow' (anything else throws at once, which read as
            // "down" for every nb-web on another origin, over Tailscale say)
            await fetch(u, { mode: same ? 'same-origin' : 'no-cors', redirect: same ? 'manual' : 'follow',
                             cache: 'no-store', credentials: 'omit', signal: ctl.signal });
            return 'up';
        } catch { return 'down'; }
        finally { clearTimeout(timer); }
    }
    function nbHealth({ fresh = false } = {}) {
        if (!fresh && _nbHealth && Date.now() - _nbHealthAt < 30_000) return _nbHealth;
        _nbHealthAt = Date.now();
        _nbHealth = (async () => {
            let d = {};
            try { d = await get('api/nb/health'); } catch { /* the server is down: nothing local */ }
            const no = { ok: false };
            const serverUrl = d.nb_web_url || '';
            const here = window.twNav?.nbWebHere?.() || '';   // this device's own (nav.js)
            // as the menu's nb-web link (nav.js): this device's, the launcher's, nb-web's usual
            // port where this page is; the first that answers is nb-web's address for nb: links
            const tries = (window.twNav?.nbWebCandidates?.(serverUrl) || [here || serverUrl].filter(Boolean))
                .map(u => ({ u, up: _probeNbWeb(u) }));
            let url = '', state = here || serverUrl ? 'down' : 'unset';   // none set: unset, unless one answers
            for (const t of tries) if (await t.up === 'up') { url = t.u; state = 'up'; break; }
            if (!url) url = here || serverUrl;
            return {
                nb: d.nb || no, plugin: d.plugin || no, tasknotes: d.tasknotes || no,
                notes: d.notes || { ok: false, path: '' }, termuxOpen: d.termux_open || no,
                nbWeb: { state, url, serverUrl, here: !!here },
            };
        })();
        return _nbHealth;
    }

    // ── Command mode's vocabulary (bug 9) ─────────────────────────────────────
    let _vocab = null;
    async function vocab() {
        if (!_vocab) {
            const d = await get('api/commands');
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

    return { stamp, store: { read, save, invalidate }, api: { get, write, handleWriteResult, networkError, NO_ANSWER },
             commands: { vocab, isCommandWord, isFilterOnly }, nbHealth, NB_MISSING };
})();
