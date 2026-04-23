/**
 * tw-web shared chrome — two-bar responsive layout.
 * Inject with: <script src="/nav.js"></script> in <head> (synchronous).
 *
 * Bar 1 (nav-bar): [logo→menu] [Task(warrior)→refresh] List Kanban Day Planner Calendar
 *                  | [filter..][×] [pri..][×] [project..][×] [tags..][×] [count/total][+]
 * Bar 2 (btn-bar): [ctx buttons]  |  [Pending] [Recurring] [Waiting] [Completed] [Deleted]
 * Bar 3 (filter-bar): active filter summary — hidden when nothing active
 *
 * Side menu (logo click): About · Projects · Tags · Stats · Settings · Sync
 *
 * Public API:  window.twNav.getState()
 *              window.twNav.setState(patch, {clientOnly})
 *              window.twNav.stateToParams(state?)
 *              window.twNav.setCount(filtered, total)
 */
(function () {
    'use strict';

    // ── Config ────────────────────────────────────────────────────────────────
    const BREAK    = 860;            // px — stack bars AND shorten brand name
    const DEBOUNCE = 400;            // ms — filter input debounce

    const STATE_KEY    = 'tw-nav-state';
    const CTX_KEY      = 'tw-contexts';
    const CTX_FILT_KEY = 'tw-ctx-filters';
    const COUNT_KEY    = 'tw-count-text';

    const PAGES = [
        { id: 'tasks',    href: '/',                      label: 'List'       },
        { id: 'kanban',   href: '/kanban.html',           label: 'Kanban'     },
        { id: 'agenda',   href: '/agenda.html',            label: 'Agenda'     },
        { id: 'calendar', href: '/calendar-planner.html', label: 'Calendar'   },
    ];

    const STATUS_BTNS = [
        { id: 'pending',   label: 'Pending'   },
        { id: 'recurring', label: 'Recurring' },
        { id: 'waiting',   label: 'Waiting'   },
        { id: 'completed', label: 'Completed' },
        { id: 'deleted',   label: 'Deleted'   },
    ];

    const MENU_ITEMS = ['About', 'Projects', 'Tags', 'Stats', 'Settings', 'Sync', 'Terminal'];

    // ── State ─────────────────────────────────────────────────────────────────
    function defaultState() {
        return { statuses: ['pending'], filter: '', context: '', priority: '', project: '', tags: '' };
    }
    function getState() {
        try { return Object.assign(defaultState(), JSON.parse(localStorage.getItem(STATE_KEY))); }
        catch { return defaultState(); }
    }
    function setState(patch, { clientOnly = false } = {}) {
        const next = Object.assign({}, getState(), patch);
        localStorage.setItem(STATE_KEY, JSON.stringify(next));
        _applyState(next);
        _updateFilterBar(next);
        document.dispatchEvent(new CustomEvent('tw-filter-change', { detail: { ...next, clientOnly } }));
    }
    function stateToParams(state) {
        state = state || getState();
        const p = new URLSearchParams();
        if (state.statuses && state.statuses.length) p.set('status', state.statuses.join(','));
        if (state.context) p.set('context', state.context);
        // filter / priority / project / tags — applied client-side, not sent to server
        return p.toString();
    }
    function setCount(filtered, total) {
        const text = filtered === total ? String(total) : `${filtered}/${total}`;
        const el = document.getElementById('tw-count');
        if (el) el.textContent = text;
        try { sessionStorage.setItem(COUNT_KEY, text); } catch {}
    }

    window.twNav = { getState, setState, stateToParams, setCount, openSyncDialog,
                     initProjectsSidebar, initTagsSidebar };

    // ── Helpers ───────────────────────────────────────────────────────────────
    function activePage() {
        const p = window.location.pathname;
        if (p.endsWith('kanban.html'))           return 'kanban';
        if (p.endsWith('agenda.html'))           return 'agenda';
        if (p.endsWith('calendar-planner.html')) return 'calendar';
        return 'tasks';
    }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function esc(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function ss(key, val) {
        try {
            if (val !== undefined) sessionStorage.setItem(key, JSON.stringify(val));
            else return JSON.parse(sessionStorage.getItem(key));
        } catch { return null; }
    }

    // ── CSS ───────────────────────────────────────────────────────────────────
    const CSS = `
#tw-nav-bar {
    display: flex; justify-content: space-between; align-items: center;
    height: 50px; padding: 0 14px 0 0; background: #1a1a1a;
    position: sticky; top: 0; z-index: 9999;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4); gap: 8px; box-sizing: border-box;
}
#tw-btn-bar {
    display: flex; justify-content: space-between; align-items: center;
    height: 50px; padding: 0 14px; background: #2c3e50;
    gap: 12px; box-sizing: border-box;
}
.tw-bar-left  { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; }
.tw-bar-right { display: flex; align-items: center; gap: 4px; flex-shrink: 1; }

/* logo button → opens side menu */
.tw-logo-btn {
    background: none; border: none; cursor: pointer; padding: 0;
    flex-shrink: 0; display: flex; align-items: center;
}
.tw-logo-btn:hover { opacity: 0.8; }
.tw-logo { height: 50px; width: 50px; display: block; }
.tw-logo.sync-pending { filter: sepia(1) saturate(6) hue-rotate(5deg) brightness(1.15); }
.tw-menu-item.sync-pending { color: #f0b429 !important; }

/* brand name button → refresh */
#tw-brand-refresh {
    background: none; border: none; color: #fff; font-weight: 600; font-size: 18px;
    white-space: nowrap; opacity: 0.9; flex-shrink: 0; margin-right: 4px; cursor: pointer; padding: 0;
}
#tw-brand-refresh:hover { opacity: 1; }
@keyframes tw-blink { 0%,100%{opacity:1} 35%{opacity:0.1} 65%{opacity:0.1} }
#tw-brand-refresh.blinking { animation: tw-blink 0.45s ease; }
.tw-name-short { display: none; }

/* nav links */
.tw-nav-link {
    padding: 3px 9px; border-radius: 4px; text-decoration: none;
    color: rgba(255,255,255,0.75); font-size: 14px; white-space: nowrap;
}
.tw-nav-link:hover  { background: rgba(255,255,255,0.12); color: #fff; }
.tw-nav-link.active { background: #3498db; color: #fff; }

/* filter inputs */
.tw-filter-wrap {
    display: flex; align-items: center;
    background: rgba(255,255,255,0.1); border-radius: 4px; padding: 0 6px; gap: 3px;
}
.tw-filter-wrap:focus-within { background: rgba(255,255,255,0.18); }
.tw-filter-wrap input {
    background: transparent; border: none; outline: none;
    color: #fff; font-size: 13px; padding: 5px 0;
}
.tw-filter-wrap input::placeholder { color: rgba(255,255,255,0.35); }
#tw-filter-input  { width: 90px;  min-width: 28px; }
#tw-pri-input     { width: 42px;  min-width: 20px; }
#tw-project-input { width: 80px;  min-width: 28px; }
#tw-tags-input    { width: 70px;  min-width: 28px; }
.tw-inp-clear {
    background: none; border: none; color: rgba(255,255,255,0.4);
    cursor: pointer; font-size: 14px; padding: 0 1px; line-height: 1; display: none;
}
.tw-inp-clear.vis { display: block; }
.tw-inp-clear:hover { color: #fff; }

/* count + add — single clickable unit */
#tw-add-area {
    display: flex; align-items: center; gap: 5px; cursor: pointer; flex-shrink: 0;
}
.tw-count {
    color: rgba(255,255,255,0.7); font-size: 18px; white-space: nowrap;
    min-width: 32px; text-align: right; font-weight: 500;
}
#tw-add-area:hover .tw-count { color: #fff; }
#tw-add-btn {
    width: 28px; height: 28px; border-radius: 50%;
    background: #555; border: none; color: #fff; font-size: 22px; line-height: 1;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; padding: 0 0 1px 0; pointer-events: none;
}
#tw-add-area:hover #tw-add-btn { background: #3498db; }

/* btn-bar buttons */
.tw-ctx-btn, .tw-status-btn {
    padding: 3px 9px; border-radius: 4px; border: none; font-size: 14px;
    cursor: pointer; white-space: nowrap;
    color: rgba(255,255,255,0.75); background: rgba(255,255,255,0.08);
}
.tw-ctx-btn:hover, .tw-status-btn:hover { background: rgba(255,255,255,0.18); color: #fff; }
.tw-ctx-btn.active   { background: #27ae60; color: #fff; }
.tw-status-btn.active { background: #3498db; color: #fff; }

/* active filter summary bar */
#tw-filter-bar {
    background: #0d1117; color: rgba(255,255,255,0.5);
    font-size: 11.5px; padding: 3px 14px;
    display: none; flex-wrap: wrap; gap: 10px; align-items: center;
    border-bottom: 1px solid rgba(255,255,255,0.06);
}
#tw-filter-bar.active { display: flex; }
.tw-fbar-item strong { color: rgba(255,255,255,0.65); font-weight: 500; }
.tw-fbar-sep { color: rgba(255,255,255,0.2); }

/* terminal offer banner */
#tw-terminal-offer {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    background: #1a1a2e; border: 1px solid rgba(255,255,255,0.18);
    border-radius: 8px; padding: 12px 16px;
    display: flex; align-items: flex-start; gap: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5); z-index: 20002;
    max-width: min(600px, 94vw); box-sizing: border-box;
    animation: tw-offer-in 0.2s ease;
}
@keyframes tw-offer-in { from { opacity:0; transform: translateX(-50%) translateY(10px); } }
#tw-terminal-offer-body { flex: 1; min-width: 0; }
#tw-terminal-offer-title { font-size: 13px; color: rgba(255,255,255,0.55); margin-bottom: 4px; }
#tw-terminal-offer-cmd {
    font-family: monospace; font-size: 12px; color: #e2e8f0;
    word-break: break-all; background: rgba(0,0,0,0.3);
    border-radius: 4px; padding: 4px 6px; margin-bottom: 10px;
}
#tw-terminal-offer-actions { display: flex; gap: 8px; }
.tw-offer-btn {
    padding: 5px 14px; border: none; border-radius: 5px;
    font-size: 12px; font-weight: 600; cursor: pointer;
}
.tw-offer-btn-run  { background: #3498db; color: #fff; }
.tw-offer-btn-run:hover  { background: #2980b9; }
.tw-offer-btn-dismiss { background: rgba(255,255,255,0.1); color: #ecf0f1; }
.tw-offer-btn-dismiss:hover { background: rgba(255,255,255,0.18); }

/* hook prompt dialog */
#tw-prompt-backdrop {
    display:none; position:fixed; inset:0;
    background:rgba(0,0,0,0.5); z-index:20001;
    align-items:center; justify-content:center;
}
#tw-prompt-backdrop.open { display:flex; }
#tw-prompt-dialog {
    background:#2c3e50; color:#ecf0f1;
    border-radius:8px; width:min(360px,92vw);
    box-shadow:0 8px 32px rgba(0,0,0,0.4);
    overflow:hidden;
}
#tw-prompt-header {
    padding:14px 16px 10px;
    border-bottom:1px solid rgba(255,255,255,0.1);
    font-size:1rem; font-weight:600;
    display:flex; align-items:center; gap:8px;
}
#tw-prompt-header .tw-prompt-icon { font-size:1.2rem; }
#tw-prompt-body { padding:14px 16px; }
#tw-prompt-question { font-size:0.95rem; margin-bottom:6px; }
#tw-prompt-context  { font-size:0.78rem; color:rgba(255,255,255,0.45); margin-bottom:14px; min-height:0; }
#tw-prompt-timer {
    height:3px; background:rgba(255,255,255,0.12); border-radius:2px; margin-bottom:14px;
}
#tw-prompt-timer-bar {
    height:100%; background:#3498db; border-radius:2px;
    transition:width 1s linear;
}
#tw-prompt-actions { display:flex; gap:8px; justify-content:flex-end; }
.tw-prompt-btn {
    padding:7px 20px; border:none; border-radius:5px;
    font-size:0.88rem; font-weight:600; cursor:pointer;
}
.tw-prompt-btn-yes  { background:#3498db; color:#fff; }
.tw-prompt-btn-yes:hover  { background:#2980b9; }
.tw-prompt-btn-no   { background:rgba(255,255,255,0.1); color:#ecf0f1; }
.tw-prompt-btn-no:hover   { background:rgba(255,255,255,0.18); }

/* side menu */
#tw-side-menu {
    position: fixed; top: 0; left: -270px; width: 260px; height: 100vh;
    background: #111; z-index: 20000; transition: left 0.22s ease;
    display: flex; flex-direction: column;
    box-shadow: 4px 0 24px rgba(0,0,0,0.6); box-sizing: border-box;
}
#tw-side-menu.open { left: 0; }
.tw-menu-header {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.1); background: #1a1a1a; flex-shrink: 0;
}
.tw-menu-header img  { height: 34px; width: 34px; }
.tw-menu-header span { color: #fff; font-size: 15px; font-weight: 600; }
.tw-menu-items { flex: 1; padding: 8px 0; overflow-y: auto; }
.tw-menu-item {
    display: block; width: 100%; text-align: left; padding: 11px 20px;
    background: none; border: none; border-left: 3px solid transparent;
    color: rgba(255,255,255,0.7); font-size: 15px; cursor: pointer;
}
.tw-menu-item:hover { background: rgba(255,255,255,0.07); color: #fff; border-left-color: #3498db; }
#tw-menu-backdrop {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.4); z-index: 19999;
}
#tw-menu-backdrop.open { display: block; }

/* ── side menu panels ── */
.tw-menu-panel {
    display: none; flex: 1; flex-direction: column; overflow: hidden; min-height: 0;
}
.tw-menu-panel.open { display: flex; }
.tw-panel-header {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; background: #1a1a1a;
}
.tw-panel-back {
    background: none; border: none; color: rgba(255,255,255,0.55);
    cursor: pointer; font-size: 13px; padding: 3px 8px; border-radius: 4px; flex-shrink: 0;
}
.tw-panel-back:hover { color: #fff; background: rgba(255,255,255,0.1); }
.tw-panel-title { color: #fff; font-size: 15px; font-weight: 600; }
.tw-panel-body  { flex: 1; overflow-y: auto; padding: 6px 0; }
.tw-pick-item {
    display: flex; align-items: center; width: 100%; text-align: left; padding: 5px 16px;
    background: none; border: none; border-left: 3px solid transparent;
    color: rgba(255,255,255,0.7); font-size: 14px; cursor: pointer; box-sizing: border-box;
}
.tw-proj-arrow {
    width: 14px; font-size: 9px; flex-shrink: 0;
    color: rgba(255,255,255,0.3); line-height: 1; padding-right: 2px; pointer-events: none;
}
.tw-proj-label { flex: 1; }
.tw-proj-count { font-size: 11px; color: rgba(255,255,255,0.3); margin-left: 6px; flex-shrink: 0; pointer-events: none; }
.tw-proj-total { font-size: 11px; color: rgba(255,255,255,0.3); margin-left: auto; align-self: center; }
.tw-toggle-bar {
    display: flex; gap: 5px; padding: 6px 16px 4px;
}
.tw-toggle-btn {
    padding: 2px 10px; font-size: 11px; border-radius: 10px; cursor: pointer;
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
    color: rgba(255,255,255,0.5);
}
.tw-toggle-btn.active { background: #3498db; border-color: #3498db; color: #fff; }
.tw-pick-item:hover  { background: rgba(255,255,255,0.07); color: #fff; border-left-color: #3498db; }
.tw-pick-item.active { color: #fff; border-left-color: #3498db; background: rgba(52,152,219,0.15); }
.tw-pick-section-label {
    padding: 10px 16px 3px; font-size: 10.5px; color: rgba(255,255,255,0.35);
    text-transform: uppercase; letter-spacing: 0.06em; user-select: none;
}
.tw-about-section { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.07); }
.tw-about-section h3 { font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; font-weight: 500; }
.tw-about-section p  { font-size: 13px; color: rgba(255,255,255,0.75); margin-bottom: 6px; line-height: 1.5; }
.tw-about-section a  { display: block; font-size: 13px; color: #3498db; text-decoration: none; margin-top: 5px; }
.tw-about-section a:hover { text-decoration: underline; }
.tw-stats-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.tw-stats-table tr { border-bottom: 1px solid rgba(255,255,255,0.05); }
.tw-stats-table td { padding: 6px 16px; color: rgba(255,255,255,0.75); }
.tw-stats-table td:last-child { text-align: right; color: #fff; font-weight: 500; font-variant-numeric: tabular-nums; }
.tw-panel-loading { padding: 16px; color: rgba(255,255,255,0.4); font-size: 13px; }
.tw-panel-error   { padding: 16px; color: #e74c3c; font-size: 13px; }
.tw-settings-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.06);
}
.tw-settings-label { font-size: 13px; color: rgba(255,255,255,0.75); }
.tw-settings-note  { font-size: 11px; color: rgba(255,255,255,0.35); margin-top: 2px; }
.tw-settings-row.stack { flex-direction: column; align-items: stretch; gap: 4px; }
.tw-settings-row.stack .tw-settings-note { margin-top: 0; }
.tw-settings-row.stack .tw-settings-input { width: 100% !important; box-sizing: border-box; }
.tw-settings-section-label {
    padding: 10px 16px 4px; font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
    text-transform: uppercase; color: rgba(255,255,255,0.3);
}
.tw-settings-input {
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
    border-radius: 4px; color: #ecf0f1; font-size: 12px; padding: 4px 6px;
}
.tw-settings-input:focus { outline: none; border-color: #3498db; background: rgba(255,255,255,0.12); }

/* responsive — stack both bars at BREAK */
@media (max-width: ${BREAK}px) {
    #tw-nav-bar {
        height: auto; flex-wrap: wrap; padding: 5px 10px; gap: 4px;
    }
    #tw-btn-bar {
        height: auto; flex-wrap: wrap; padding: 5px 10px; gap: 4px;
    }
    .tw-bar-left  { flex-wrap: wrap; width: 100%; justify-content: flex-start; }
    .tw-bar-right { flex-wrap: wrap; width: 100%; justify-content: flex-end; }
    #tw-filter-input, #tw-pri-input, #tw-project-input, #tw-tags-input { width: 55px; min-width: 22px; }
    .tw-name-full  { display: none; }
    .tw-name-short { display: inline; }
}
`;

    // ── HTML builders ─────────────────────────────────────────────────────────
    function buildNavBar(active) {
        const links = PAGES.map(p =>
            `<a href="${p.href}" class="tw-nav-link${p.id === active ? ' active' : ''}">${p.label}</a>`
        ).join('');
        return (
            `<div class="tw-bar-left">` +
                `<button id="tw-logo-btn" class="tw-logo-btn" title="Menu">` +
                    `<img src="/logo.svg" alt="Menu" class="tw-logo">` +
                `</button>` +
                `<button id="tw-brand-refresh" title="Refresh">` +
                    `<span class="tw-name-full">Taskwarrior</span>` +
                    `<span class="tw-name-short">Task</span>` +
                `</button>` +
                links +
            `</div>` +
            `<div class="tw-bar-right">` +
                `<div class="tw-filter-wrap">` +
                    `<input id="tw-filter-input"  type="text" placeholder="filter.."  autocomplete="off">` +
                    `<button class="tw-inp-clear" id="tw-filter-clear"  title="Clear">×</button>` +
                `</div>` +
                `<div class="tw-filter-wrap">` +
                    `<input id="tw-pri-input"     type="text" placeholder="pri.."     autocomplete="off">` +
                    `<button class="tw-inp-clear" id="tw-pri-clear"    title="Clear">×</button>` +
                `</div>` +
                `<div class="tw-filter-wrap">` +
                    `<input id="tw-project-input" type="text" placeholder="project.." autocomplete="off">` +
                    `<button class="tw-inp-clear" id="tw-project-clear" title="Clear">×</button>` +
                `</div>` +
                `<div class="tw-filter-wrap">` +
                    `<input id="tw-tags-input"    type="text" placeholder="tags.."    autocomplete="off">` +
                    `<button class="tw-inp-clear" id="tw-tags-clear"   title="Clear">×</button>` +
                `</div>` +
                `<div id="tw-add-area" title="Add task">` +
                    `<span id="tw-count" class="tw-count"></span>` +
                    `<button id="tw-add-btn" tabindex="-1">+</button>` +
                `</div>` +
            `</div>`
        );
    }

    function buildCtxBtns(state, contexts) {
        return [
            `<button class="tw-ctx-btn${!state.context ? ' active' : ''}" data-ctx="">All</button>`,
            ...contexts.map(c =>
                `<button class="tw-ctx-btn${state.context === c ? ' active' : ''}" data-ctx="${c}">${cap(c)}</button>`)
        ].join('');
    }

    function buildBtnBar(state, contexts, active) {
        const statusBtns = active === 'kanban' ? '' : STATUS_BTNS.map(s =>
            `<button class="tw-status-btn${state.statuses.includes(s.id) ? ' active' : ''}" data-status="${s.id}">${s.label}</button>`
        ).join('');
        return (
            `<div class="tw-bar-left"  id="tw-ctx-btns">${buildCtxBtns(state, contexts)}</div>` +
            `<div class="tw-bar-right" id="tw-status-btns">${statusBtns}</div>`
        );
    }

    // ── Filter bar ────────────────────────────────────────────────────────────
    function _updateFilterBar(state) {
        const bar = document.getElementById('tw-filter-bar');
        if (!bar) return;
        const parts = [];
        if (state.context) {
            const ctxFilters = ss(CTX_FILT_KEY) || {};
            const expr = ctxFilters[state.context];
            parts.push(`<span class="tw-fbar-item"><strong>ctx:</strong> ${esc(expr || state.context)}</span>`);
        }
        if (state.filter)   parts.push(`<span class="tw-fbar-item"><strong>filter:</strong> "${esc(state.filter)}"</span>`);
        if (state.priority) parts.push(`<span class="tw-fbar-item"><strong>pri:</strong> ${esc(state.priority)}</span>`);
        if (state.project)  parts.push(`<span class="tw-fbar-item"><strong>project:</strong> ${esc(state.project)}</span>`);
        if (state.tags)     parts.push(`<span class="tw-fbar-item"><strong>tags:</strong> ${esc(state.tags)}</span>`);
        bar.innerHTML = parts.join('<span class="tw-fbar-sep"> | </span>');
        bar.classList.toggle('active', parts.length > 0);
    }

    // ── Apply state to live DOM ───────────────────────────────────────────────
    function _applyState(state) {
        [
            ['tw-filter-input',  'tw-filter-clear',  state.filter   || ''],
            ['tw-pri-input',     'tw-pri-clear',     state.priority || ''],
            ['tw-project-input', 'tw-project-clear', state.project  || ''],
            ['tw-tags-input',    'tw-tags-clear',    state.tags     || ''],
        ].forEach(([inpId, clrId, val]) => {
            const inp = document.getElementById(inpId);
            const clr = document.getElementById(clrId);
            if (inp && inp.value !== val) inp.value = val;
            if (clr) clr.classList.toggle('vis', !!val);
        });
        document.querySelectorAll('.tw-ctx-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.ctx === state.context));
        document.querySelectorAll('.tw-status-btn').forEach(b =>
            b.classList.toggle('active', state.statuses.includes(b.dataset.status)));
    }

    // ── Side menu ─────────────────────────────────────────────────────────────
    function openMenu()  {
        document.getElementById('tw-side-menu').classList.add('open');
        document.getElementById('tw-menu-backdrop').classList.add('open');
    }
    function closeMenu() {
        document.getElementById('tw-side-menu').classList.remove('open');
        document.getElementById('tw-menu-backdrop').classList.remove('open');
    }

    // ── Event wiring ──────────────────────────────────────────────────────────
    function bindEvents() {
        function wireInput(inpId, clrId, stateKey) {
            const inp = document.getElementById(inpId);
            const clr = document.getElementById(clrId);
            if (!inp) return;
            let timer;
            inp.addEventListener('input', () => {
                clr.classList.toggle('vis', !!inp.value);
                clearTimeout(timer);
                timer = setTimeout(() => setState({ [stateKey]: inp.value }, { clientOnly: true }), DEBOUNCE);
            });
            clr.addEventListener('click', () => {
                inp.value = '';
                clr.classList.remove('vis');
                setState({ [stateKey]: '' }, { clientOnly: true });
            });
        }

        wireInput('tw-filter-input',  'tw-filter-clear',  'filter');
        wireInput('tw-pri-input',     'tw-pri-clear',     'priority');
        wireInput('tw-project-input', 'tw-project-clear', 'project');
        wireInput('tw-tags-input',    'tw-tags-clear',    'tags');

        // Logo → side menu
        document.getElementById('tw-logo-btn').addEventListener('click', openMenu);
        document.getElementById('tw-menu-backdrop').addEventListener('click', closeMenu);
        document.getElementById('tw-side-menu').addEventListener('click', e => {
            if (e.target.closest('#tw-panel-back')) { closePanel(); return; }
            const item = e.target.closest('.tw-menu-item');
            if (!item) return;
            const action = item.dataset.menu;
            if (action === 'sync') {
                closeMenu();
                openSyncDialog();
            } else if (action === 'about')    { openAboutPanel();    }
            else if (action === 'projects')   { openProjectsPanel(); }
            else if (action === 'tags')       { openTagsPanel();     }
            else if (action === 'stats')      { openStatsPanel();    }
            else if (action === 'settings')   { openSettingsPanel(); }
            else if (action === 'terminal')   { closeMenu(); openTerminal(); }
            else { closeMenu(); document.dispatchEvent(new CustomEvent('tw-menu-action', { detail: { action } })); }
        });

        // Brand text → force refresh (bypass cache) with blink
        document.getElementById('tw-brand-refresh').addEventListener('click', () => {
            const btn = document.getElementById('tw-brand-refresh');
            btn.classList.add('blinking');
            btn.addEventListener('animationend', () => btn.classList.remove('blinking'), { once: true });
            // Invalidate cache so loadTasks() always hits the server
            try { sessionStorage.setItem('tw-tasks-dirty', '1'); } catch {}
            document.dispatchEvent(new CustomEvent('tw-filter-change', { detail: getState() }));
            document.dispatchEvent(new CustomEvent('tw-show-notification',
                { detail: { message: 'Refreshed', type: 'success' } }));
        });

        // Count + add area → open add dialog
        document.getElementById('tw-add-area').addEventListener('click', () =>
            document.dispatchEvent(new CustomEvent('tw-open-add')));

        // Context buttons
        document.getElementById('tw-ctx-btns').addEventListener('click', e => {
            const b = e.target.closest('.tw-ctx-btn');
            if (b) setState({ context: b.dataset.ctx });
        });

        // Status buttons
        document.getElementById('tw-status-btns').addEventListener('click', e => {
            const b = e.target.closest('.tw-status-btn');
            if (b) setState({ statuses: [b.dataset.status] });
        });
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function init() {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        const state    = getState();
        const active   = activePage();
        const contexts = ss(CTX_KEY) || [];

        // Nav bar
        const navBar = document.createElement('div');
        navBar.id = 'tw-nav-bar';
        navBar.innerHTML = buildNavBar(active);

        // Button bar
        const btnBar = document.createElement('div');
        btnBar.id = 'tw-btn-bar';
        btnBar.innerHTML = buildBtnBar(state, contexts, active);

        // Filter summary bar (hidden until a filter is active)
        const filterBar = document.createElement('div');
        filterBar.id = 'tw-filter-bar';

        // Side menu + backdrop
        const sideMenu = document.createElement('div');
        sideMenu.id = 'tw-side-menu';
        sideMenu.innerHTML =
            `<div class="tw-menu-header">` +
                `<img src="/logo.svg" alt="">` +
                `<span>Taskwarrior</span>` +
            `</div>` +
            `<nav class="tw-menu-items" id="tw-menu-list">` +
                MENU_ITEMS.map(item =>
                    `<button class="tw-menu-item" data-menu="${item.toLowerCase()}">${item}</button>`
                ).join('') +
            `</nav>` +
            `<div id="tw-menu-panel" class="tw-menu-panel">` +
                `<div class="tw-panel-header">` +
                    `<button id="tw-panel-back" class="tw-panel-back">← Back</button>` +
                    `<span id="tw-panel-title" class="tw-panel-title"></span>` +
                `</div>` +
                `<div id="tw-panel-body" class="tw-panel-body"></div>` +
            `</div>`;

        const backdrop = document.createElement('div');
        backdrop.id = 'tw-menu-backdrop';

        // Insert order: navBar first child → btnBar → filterBar → sideMenu → backdrop
        [backdrop, sideMenu, filterBar, btnBar, navBar].forEach(el =>
            document.body.insertBefore(el, document.body.firstChild));

        // Sync dialog — appended to body, managed entirely by nav.js
        const syncDlg = document.createElement('div');
        syncDlg.id = 'tw-sync-dialog';
        syncDlg.className = 'sync-dialog-backdrop';
        syncDlg.style.display = 'none';
        syncDlg.innerHTML =
            `<div class="sync-dialog">` +
                `<div class="sync-dialog-header">` +
                    `<span>Sync</span>` +
                    `<button id="tw-sync-close" class="sync-dialog-close">×</button>` +
                `</div>` +
                `<div class="sync-dialog-body">` +
                    `<input type="text" id="tw-sync-comment" class="sync-comment-input" placeholder="Comment (optional)">` +
                    `<div id="tw-sync-method" class="sync-method"></div>` +
                    `<div id="tw-sync-changes" class="sync-changes"></div>` +
                    `<div class="sync-btn-row">` +
                        `<button id="tw-sync-now" class="sync-now-btn">Sync Now</button>` +
                        `<button id="tw-sync-log" class="sync-secondary-btn">Show Log</button>` +
                        `<button id="tw-sync-undo" class="sync-secondary-btn sync-undo-btn">Undo</button>` +
                    `</div>` +
                    `<pre id="tw-sync-output" class="sync-output" style="display:none"></pre>` +
                `</div>` +
            `</div>`;
        document.body.appendChild(syncDlg);

        // Restore count from last visit immediately (before API returns)
        const savedCount = sessionStorage.getItem(COUNT_KEY);
        if (savedCount) {
            const el = document.getElementById('tw-count');
            if (el) el.textContent = savedCount;
        }

        _applyState(state);
        _updateFilterBar(state);
        bindEvents();

        // Sync status indicator
        pollSyncStatus();
        setInterval(pollSyncStatus, 60_000);
        window.twPollSyncStatus = pollSyncStatus;

        // Background: refresh context list, update buttons if changed
        fetchContexts().catch(() => ({ names: [], filters: {} })).then(({ names, filters }) => {
            ss(CTX_KEY, names);
            ss(CTX_FILT_KEY, filters);
            if (JSON.stringify(names) !== JSON.stringify(contexts)) {
                const ctxDiv = document.getElementById('tw-ctx-btns');
                if (ctxDiv) ctxDiv.innerHTML = buildCtxBtns(getState(), names);
                _applyState(getState());
            }
            _updateFilterBar(getState());   // refresh with real context expressions
        });

        // Background: fetch notification timeout
        fetch('/api/config').then(r => r.json()).then(d => {
            window.twNotifTimeout = (d.notification_timeout != null) ? d.notification_timeout : 3000;
        }).catch(() => { window.twNotifTimeout = 3000; });
    }

    function updateSyncIndicator(changes) {
        const logo    = document.querySelector('.tw-logo');
        const logoBtn = document.getElementById('tw-logo-btn');
        const syncBtn = document.querySelector('.tw-menu-item[data-menu="sync"]');
        if (changes > 0) {
            logo?.classList.add('sync-pending');
            logoBtn?.setAttribute('title', `${changes} file${changes !== 1 ? 's' : ''} changed — Menu`);
            syncBtn?.classList.add('sync-pending');
            if (syncBtn) syncBtn.textContent = `Sync (${changes} file${changes !== 1 ? 's' : ''} changed)`;
        } else {
            logo?.classList.remove('sync-pending');
            logoBtn?.setAttribute('title', 'Menu');
            syncBtn?.classList.remove('sync-pending');
            if (syncBtn) syncBtn.textContent = 'Sync';
        }
    }

    async function pollSyncStatus() {
        try {
            const r = await fetch('/api/sync/status');
            const d = await r.json();
            updateSyncIndicator(d.changes || 0);
        } catch {}
    }

    async function fetchContexts() {
        try {
            const r = await fetch('/api/contexts');
            const d = await r.json();
            if (d.success) return { names: d.contexts || [], filters: d.filters || {} };
        } catch {}
        return { names: [], filters: {} };
    }

    // ── Panel system ─────────────────────────────────────────────────────────
    function openPanel(title) {
        document.getElementById('tw-menu-list').style.display  = 'none';
        document.getElementById('tw-panel-title').textContent  = title;
        document.getElementById('tw-panel-body').innerHTML     = '<div class="tw-panel-loading">Loading…</div>';
        document.getElementById('tw-menu-panel').classList.add('open');
    }
    function closePanel() {
        document.getElementById('tw-menu-list').style.display  = '';
        document.getElementById('tw-menu-panel').classList.remove('open');
    }
    function panelBody() { return document.getElementById('tw-panel-body'); }

    // ── About panel ───────────────────────────────────────────────────────────
    function openAboutPanel() {
        openPanel('About');
        panelBody().innerHTML =
            `<div class="tw-about-section">` +
                `<h3>Taskwarrior</h3>` +
                `<p>A powerful, free, open-source command-line task manager for Linux, macOS, and Windows.</p>` +
                `<a href="https://taskwarrior.org" target="_blank">taskwarrior.org →</a>` +
                `<a href="https://taskwarrior.org/docs/" target="_blank">Documentation →</a>` +
                `<a href="https://taskwarrior.org/support/" target="_blank">Support & community →</a>` +
            `</div>` +
            `<div class="tw-about-section">` +
                `<h3>tw-web</h3>` +
                `<p>A lightweight PWA web interface for Taskwarrior 2.6.x — List, Kanban, Agenda, and Calendar views, with drag-and-drop scheduling and full CRUD.</p>` +
                `<p>Part of the <strong style="color:rgba(255,255,255,0.9)">awesome-taskwarrior</strong> fleet.</p>` +
                `<a href="https://github.com/linuxcaffe/tw-web" target="_blank">GitHub: linuxcaffe/tw-web →</a>` +
            `</div>` +
            `<div class="tw-about-section">` +
                `<h3>Required UDAs</h3>` +
                `<p style="font-family:monospace;font-size:12px;color:rgba(255,255,255,0.6);line-height:1.9">` +
                    `uda.state.type=string<br>` +
                    `uda.priority.values=1,2,3,4,5,6,H,M,L` +
                `</p>` +
            `</div>`;
    }

    // ── Terminal launch ───────────────────────────────────────────────────────
    async function openTerminal(cmd) {
        try {
            const r = await fetch('/api/terminal', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ cmd: cmd || '' }),
            });
            const d = await r.json();
            if (d.success) {
                document.dispatchEvent(new CustomEvent('tw-show-notification',
                    { detail: { message: `Launching ${d.terminal || 'terminal'}…`, type: 'info' } }));
            } else {
                document.dispatchEvent(new CustomEvent('tw-show-notification',
                    { detail: { message: d.error || 'Could not open terminal', type: 'error' } }));
            }
        } catch (e) {
            document.dispatchEvent(new CustomEvent('tw-show-notification',
                { detail: { message: 'Terminal request failed', type: 'error' } }));
        }
    }
    function offerTerminal(cmd) {
        // Remove any existing offer first
        document.getElementById('tw-terminal-offer')?.remove();

        const el = document.createElement('div');
        el.id = 'tw-terminal-offer';
        el.innerHTML =
            `<div id="tw-terminal-offer-body">` +
                `<div id="tw-terminal-offer-title">Action queued — run in terminal?</div>` +
                `<div id="tw-terminal-offer-cmd">${esc(cmd)}</div>` +
                `<div id="tw-terminal-offer-actions">` +
                    `<button class="tw-offer-btn tw-offer-btn-run">▶ Open in terminal</button>` +
                    `<button class="tw-offer-btn tw-offer-btn-dismiss">Dismiss</button>` +
                `</div>` +
            `</div>`;

        el.querySelector('.tw-offer-btn-run').addEventListener('click', () => {
            el.remove();
            openTerminal(cmd);
        });
        el.querySelector('.tw-offer-btn-dismiss').addEventListener('click', () => el.remove());
        document.body.appendChild(el);
    }

    // Expose for page scripts (e.g. to retry a timed-out command in terminal)
    window.twTerminal = { open: openTerminal, offerTerminal };

    async function _initTerminalVisibility() {
        try {
            const r = await fetch('/api/terminal/check');
            const d = await r.json();
            if (!d.available) {
                const btn = document.querySelector('.tw-menu-item[data-menu="terminal"]');
                if (btn) btn.style.display = 'none';
            }
        } catch { /* ignore — keep the button visible */ }
    }

    // ── Projects panel ────────────────────────────────────────────────────────
    async function openProjectsPanel(mode) {
        if (!mode || mode === 'count') mode = localStorage.getItem('tw-proj-mode') || 'active';
        localStorage.setItem('tw-proj-mode', mode);
        openPanel('Projects');
        const body = panelBody();

        let collapsed;
        try { collapsed = new Set(JSON.parse(localStorage.getItem('tw-proj-collapsed') || '[]')); }
        catch { collapsed = new Set(); }
        function saveCollapsed() {
            localStorage.setItem('tw-proj-collapsed', JSON.stringify([...collapsed]));
        }

        function render(allProjects) {
            const names = allProjects.map(p => p.name);
            const state = getState();

            let html =
                `<div class="tw-toggle-bar">` +
                    `<button class="tw-toggle-btn${mode === 'active' ? ' active' : ''}" data-mode="active">active</button>` +
                    `<button class="tw-toggle-btn${mode === 'all'    ? ' active' : ''}" data-mode="all">all</button>` +
                    `<span class="tw-proj-total">${allProjects.length}</span>` +
                `</div>` +
                `<button class="tw-pick-item${!state.project ? ' active' : ''}" data-pick="">` +
                    `<span class="tw-proj-label">All projects</span></button>` +
                `<button class="tw-pick-item${state.project === '.none:' ? ' active' : ''}" data-pick=".none:">` +
                    `<span class="tw-proj-label">No project</span></button>`;

            if (allProjects.length) {
                html += `<div class="tw-pick-section-label">Projects</div>`;
                allProjects.forEach(({ name, count }) => {
                    const parts    = name.split('.');
                    const depth    = parts.length - 1;
                    const label    = parts[parts.length - 1];
                    const pad      = 16 + depth * 12;
                    const isParent = names.some(n => n.startsWith(name + '.'));
                    const isColl   = collapsed.has(name);
                    const hidden   = parts.some((_, i) => i > 0 && collapsed.has(parts.slice(0, i).join('.')));
                    if (hidden) return;
                    const arrow = isParent
                        ? `<span class="tw-proj-arrow">${isColl ? '▶' : '▼'}</span>`
                        : `<span class="tw-proj-arrow"></span>`;
                    const badge = count ? `<span class="tw-proj-count">${count}</span>` : '';
                    // Parent: data-fold on button, data-pick on label only (so left area folds, text picks)
                    // Non-parent: data-pick on button as usual
                    if (isParent) {
                        html += `<button class="tw-pick-item${state.project === name ? ' active' : ''}" ` +
                                `data-fold="${esc(name)}" style="padding-left:${pad}px" title="${esc(name)}">` +
                                `${arrow}<span class="tw-proj-label" data-pick="${esc(name)}">${esc(label)}</span>${badge}</button>`;
                    } else {
                        html += `<button class="tw-pick-item${state.project === name ? ' active' : ''}" ` +
                                `data-pick="${esc(name)}" style="padding-left:${pad}px" title="${esc(name)}">` +
                                `${arrow}<span class="tw-proj-label">${esc(label)}</span>${badge}</button>`;
                    }
                });
            } else {
                html += `<div class="tw-panel-loading">No projects found</div>`;
            }
            body.innerHTML = html;
        }

        try {
            const r = await fetch('/api/projects' + (mode === 'all' ? '' : '?active=1'));
            const d = await r.json();
            const projects = (d.projects || []).filter(p => p && p.name);
            render(projects);

            body.onclick = e => {
                const tog = e.target.closest('[data-mode]');
                if (tog) { openProjectsPanel(tog.dataset.mode); return; }
                // Label click on a parent row → pick, not fold
                const lbl = e.target.closest('.tw-proj-label[data-pick]');
                if (lbl) {
                    setState({ project: lbl.dataset.pick }, { clientOnly: true });
                    closeMenu();
                    return;
                }
                // Click anywhere else on a foldable row → fold
                const foldBtn = e.target.closest('[data-fold]');
                if (foldBtn) {
                    const name = foldBtn.dataset.fold;
                    if (collapsed.has(name)) collapsed.delete(name); else collapsed.add(name);
                    saveCollapsed();
                    render(projects);
                    return;
                }
                // Non-parent button → pick
                const btn = e.target.closest('[data-pick]');
                if (!btn) return;
                setState({ project: btn.dataset.pick }, { clientOnly: true });
                closeMenu();
            };
        } catch { body.innerHTML = '<div class="tw-panel-error">Failed to load projects</div>'; }
    }

    // ── Tags panel ────────────────────────────────────────────────────────────
    async function openTagsPanel(mode) {
        if (mode === undefined) mode = localStorage.getItem('tw-tags-mode') || 'active';
        localStorage.setItem('tw-tags-mode', mode);
        openPanel('Tags');
        const body = panelBody();
        try {
            const r = await fetch('/api/tags' + (mode === 'all' ? '' : '?active=1'));
            const d = await r.json();
            const allTags = (d.tags || []).filter(Boolean).sort();
            const state   = getState();
            const sel     = (state.tags || '').split(',').map(t => t.trim()).filter(Boolean);

            let html =
                `<div class="tw-toggle-bar">` +
                    `<button class="tw-toggle-btn${mode === 'active' ? ' active' : ''}" data-mode="active">active</button>` +
                    `<button class="tw-toggle-btn${mode === 'all'    ? ' active' : ''}" data-mode="all">all</button>` +
                    `<span class="tw-proj-total">${allTags.length}</span>` +
                `</div>` +
                `<button class="tw-pick-item${!sel.length ? ' active' : ''}" data-pick="">` +
                    `<span class="tw-proj-label">All tags</span></button>` +
                `<button class="tw-pick-item${state.tags === '.none:' ? ' active' : ''}" data-pick=".none:">` +
                    `<span class="tw-proj-label">No tags</span></button>`;
            if (allTags.length) {
                html += `<div class="tw-pick-section-label">Tags</div>`;
                allTags.forEach(t => {
                    html += `<button class="tw-pick-item${sel.includes(t) ? ' active' : ''}" data-pick="${esc(t)}">` +
                            `<span class="tw-proj-label">+${esc(t)}</span></button>`;
                });
            }
            body.innerHTML = html;
            body.onclick = e => {
                const tog = e.target.closest('[data-mode]');
                if (tog) { openTagsPanel(tog.dataset.mode); return; }
                const btn = e.target.closest('[data-pick]');
                if (!btn) return;
                setState({ tags: btn.dataset.pick }, { clientOnly: true });
                closeMenu();
            };
        } catch { body.innerHTML = '<div class="tw-panel-error">Failed to load tags</div>'; }
    }

    // ── Inline sidebars (List / Agenda pages) ────────────────────────────────
    async function initProjectsSidebar(container) {
        if (!container) return;
        let mode = localStorage.getItem('tw-proj-mode') || 'active';
        let allProjects = [];
        let sbCollapsed;
        try { sbCollapsed = new Set(JSON.parse(localStorage.getItem('tw-proj-collapsed') || '[]')); }
        catch { sbCollapsed = new Set(); }
        function saveSbCollapsed() {
            localStorage.setItem('tw-proj-collapsed', JSON.stringify([...sbCollapsed]));
        }

        function render() {
            const state = getState();
            const names = allProjects.map(p => p.name);
            let html =
                `<div class="tw-sb-label">Projects</div>` +
                `<div class="tw-toggle-bar">` +
                    `<button class="tw-toggle-btn${mode==='active'?' active':''}" data-mode="active">active</button>` +
                    `<button class="tw-toggle-btn${mode==='all'?' active':''}" data-mode="all">all</button>` +
                    `<span class="tw-proj-total">${allProjects.length}</span>` +
                `</div>` +
                `<button class="tw-pick-item${!state.project?' active':''}" data-pick=""><span class="tw-proj-label">All projects</span></button>` +
                `<button class="tw-pick-item${state.project==='.none:'?' active':''}" data-pick=".none:"><span class="tw-proj-label">No project</span></button>`;
            if (allProjects.length) {
                html += `<div class="tw-pick-section-label">Projects</div>`;
                allProjects.forEach(({ name, count }) => {
                    const parts    = name.split('.');
                    const depth    = parts.length - 1;
                    const label    = parts[parts.length - 1];
                    const pad      = 16 + depth * 12;
                    const isParent = names.some(n => n.startsWith(name + '.'));
                    const isColl   = sbCollapsed.has(name);
                    const hidden   = parts.some((_, i) => i > 0 && sbCollapsed.has(parts.slice(0, i).join('.')));
                    if (hidden) return;
                    const arrow = isParent ? `<span class="tw-proj-arrow">${isColl ? '▶' : '▼'}</span>` : `<span class="tw-proj-arrow"></span>`;
                    const badge = count ? `<span class="tw-proj-count">${count}</span>` : '';
                    if (isParent) {
                        html += `<button class="tw-pick-item${state.project===name?' active':''}" data-fold="${esc(name)}" style="padding-left:${pad}px" title="${esc(name)}">${arrow}<span class="tw-proj-label" data-pick="${esc(name)}">${esc(label)}</span>${badge}</button>`;
                    } else {
                        html += `<button class="tw-pick-item${state.project===name?' active':''}" data-pick="${esc(name)}" style="padding-left:${pad}px" title="${esc(name)}">${arrow}<span class="tw-proj-label">${esc(label)}</span>${badge}</button>`;
                    }
                });
            }
            container.innerHTML = html;
        }

        async function load(m) {
            mode = m; localStorage.setItem('tw-proj-mode', mode);
            try {
                const d = await fetch('/api/projects' + (mode==='all'?'':'?active=1')).then(r=>r.json());
                allProjects = (d.projects||[]).filter(p=>p&&p.name);
                render();
            } catch { container.innerHTML = '<div class="tw-panel-error">Failed to load</div>'; }
        }

        container.addEventListener('click', e => {
            const tog = e.target.closest('[data-mode]'); if (tog) { load(tog.dataset.mode); return; }
            const lbl = e.target.closest('.tw-proj-label[data-pick]');
            if (lbl) { setState({ project: lbl.dataset.pick }, { clientOnly: true }); return; }
            const fold = e.target.closest('[data-fold]');
            if (fold) {
                const n = fold.dataset.fold;
                if (sbCollapsed.has(n)) sbCollapsed.delete(n); else sbCollapsed.add(n);
                saveSbCollapsed(); render(); return;
            }
            const btn = e.target.closest('[data-pick]');
            if (btn) setState({ project: btn.dataset.pick }, { clientOnly: true });
        });
        document.addEventListener('tw-filter-change', render);
        await load(mode);
    }

    async function initTagsSidebar(container) {
        if (!container) return;
        let mode = localStorage.getItem('tw-tags-mode') || 'active';
        let allTags = [];

        function render() {
            const state = getState();
            const sel   = (state.tags||'').split(',').map(t=>t.trim()).filter(Boolean);
            let html =
                `<div class="tw-sb-label">Tags</div>` +
                `<div class="tw-toggle-bar">` +
                    `<button class="tw-toggle-btn${mode==='active'?' active':''}" data-mode="active">active</button>` +
                    `<button class="tw-toggle-btn${mode==='all'?' active':''}" data-mode="all">all</button>` +
                    `<span class="tw-proj-total">${allTags.length}</span>` +
                `</div>` +
                `<button class="tw-pick-item${!sel.length?' active':''}" data-pick=""><span class="tw-proj-label">All tags</span></button>` +
                `<button class="tw-pick-item${state.tags==='.none:'?' active':''}" data-pick=".none:"><span class="tw-proj-label">No tags</span></button>`;
            if (allTags.length) {
                html += `<div class="tw-pick-section-label">Tags</div>`;
                allTags.forEach(t => {
                    html += `<button class="tw-pick-item${sel.includes(t)?' active':''}" data-pick="${esc(t)}"><span class="tw-proj-label">+${esc(t)}</span></button>`;
                });
            }
            container.innerHTML = html;
        }

        async function load(m) {
            mode = m; localStorage.setItem('tw-tags-mode', mode);
            try {
                const d = await fetch('/api/tags'+(mode==='all'?'':'?active=1')).then(r=>r.json());
                allTags = (d.tags||[]).filter(Boolean).sort();
                render();
            } catch { container.innerHTML = '<div class="tw-panel-error">Failed to load</div>'; }
        }

        container.addEventListener('click', e => {
            const tog = e.target.closest('[data-mode]'); if (tog) { load(tog.dataset.mode); return; }
            const btn = e.target.closest('[data-pick]');
            if (btn) setState({ tags: btn.dataset.pick }, { clientOnly: true });
        });
        document.addEventListener('tw-filter-change', render);
        await load(mode);
    }

    // ── Stats panel ───────────────────────────────────────────────────────────
    async function openStatsPanel() {
        openPanel('Stats');
        const body = panelBody();
        try {
            const r = await fetch('/api/stats');
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'failed');
            // Parse "Category    Value" lines, skip header + separator
            const rows = d.output.split('\n').reduce((acc, line) => {
                if (!line.trim() || /^─+$/.test(line.trim()) || /^Category/i.test(line.trim())) return acc;
                const m = line.match(/^(.+?)\s{2,}(.+)$/);
                if (m) acc.push([m[1].trim(), m[2].trim()]);
                return acc;
            }, []);
            if (!rows.length) { body.innerHTML = `<pre style="padding:12px;font-size:12px;color:rgba(255,255,255,0.7)">${esc(d.output)}</pre>`; return; }
            body.innerHTML =
                `<table class="tw-stats-table">` +
                rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('') +
                `</table>`;
        } catch (e) { body.innerHTML = `<div class="tw-panel-error">Failed to load stats: ${esc(String(e))}</div>`; }
    }

    // ── Settings panel ────────────────────────────────────────────────────────
    async function openSettingsPanel() {
        openPanel('Settings');
        const body = panelBody();
        let cfg;
        try {
            const r = await fetch('/api/config');
            cfg = await r.json();
        } catch { body.innerHTML = '<div class="tw-panel-error">Failed to load settings</div>'; return; }

        body.innerHTML =
            `<form id="tw-settings-form" autocomplete="off">` +
            `<div class="tw-settings-row stack">` +
                `<div class="tw-settings-label">Notification timeout</div>` +
                `<input id="tws-notif" type="number" min="0" step="500" value="${cfg.notification_timeout ?? 3000}" ` +
                    `class="tw-settings-input" style="width:90px">` +
                `<div class="tw-settings-note">ms — 0 = manual dismiss only</div>` +
            `</div>` +
            `<div class="tw-settings-row stack">` +
                `<div class="tw-settings-label">Kanban columns</div>` +
                `<input id="tws-kanban" type="text" value="${esc((cfg.kanban_columns || []).join(', '))}" ` +
                    `class="tw-settings-input">` +
                `<div class="tw-settings-note">Comma-separated, in order</div>` +
            `</div>` +
            `<div class="tw-settings-section-label">Calendar</div>` +
            `<div class="tw-settings-row stack">` +
                `<div class="tw-settings-label">Day start / end</div>` +
                `<div style="display:flex;gap:6px;align-items:center">` +
                    `<input id="tws-cal-start" type="time" value="${esc((cfg.cal_day_start  || '06:00').slice(0,5))}" class="tw-settings-input" style="width:90px">` +
                    `<span style="color:rgba(255,255,255,0.3)">–</span>` +
                    `<input id="tws-cal-end"   type="time" value="${esc((cfg.cal_day_end    || '23:00').slice(0,5))}" class="tw-settings-input" style="width:90px">` +
                `</div>` +
                `<div class="tw-settings-note">Visible hour range (HH:MM)</div>` +
            `</div>` +
            `<div class="tw-settings-row stack">` +
                `<div class="tw-settings-label">Scroll to (on open)</div>` +
                `<input id="tws-cal-scroll" type="time" value="${esc((cfg.cal_scroll_time || '08:00').slice(0,5))}" class="tw-settings-input" style="width:90px">` +
                `<div class="tw-settings-note">Time shown at top of calendar</div>` +
            `</div>` +
            `<div class="tw-settings-row stack">` +
                `<div class="tw-settings-label">Default view</div>` +
                `<select id="tws-cal-view" class="tw-settings-input">` +
                    `<option value="timeGridWeek"${cfg.cal_default_view === 'timeGridWeek'  ? ' selected' : ''}>Week</option>` +
                    `<option value="timeGridDay"${cfg.cal_default_view  === 'timeGridDay'   ? ' selected' : ''}>Day</option>` +
                    `<option value="dayGridMonth"${cfg.cal_default_view === 'dayGridMonth'  ? ' selected' : ''}>Month</option>` +
                `</select>` +
                `<div class="tw-settings-note">Opening view for Calendar page</div>` +
            `</div>` +
            `<div class="tw-settings-row stack">` +
                `<div class="tw-settings-label">Time grid slot</div>` +
                `<select id="tws-cal-slot" class="tw-settings-input">` +
                    `<option value="00:15:00"${(cfg.cal_slot_duration || '00:15:00') === '00:15:00' ? ' selected' : ''}>15 min</option>` +
                    `<option value="00:30:00"${cfg.cal_slot_duration === '00:30:00' ? ' selected' : ''}>30 min</option>` +
                    `<option value="01:00:00"${cfg.cal_slot_duration === '01:00:00' ? ' selected' : ''}>60 min</option>` +
                `</select>` +
                `<div class="tw-settings-note">Row height / snap interval</div>` +
            `</div>` +
            `<div class="tw-settings-row" style="border:none;justify-content:flex-end;gap:8px">` +
                `<span id="tws-status" style="font-size:12px;color:rgba(255,255,255,0.45)"></span>` +
                `<button type="submit" class="tw-pick-item" style="width:auto;padding:6px 16px;border:1px solid rgba(255,255,255,0.2);border-radius:4px">Save</button>` +
            `</div>` +
            `</form>` +
            `<div class="tw-about-section" style="margin-top:4px">` +
                `<h3>Developer settings</h3>` +
                `<p>Edit <code style="font-size:11px;color:rgba(255,255,255,0.55)">config.py</code> for DEVELOPER_MODE and DEBUG_FILE.</p>` +
            `</div>`;

        body.querySelector('#tw-settings-form').addEventListener('submit', async e => {
            e.preventDefault();
            const status    = body.querySelector('#tws-status');
            const notifVal  = parseInt(body.querySelector('#tws-notif').value, 10);
            const kanbanVal = body.querySelector('#tws-kanban').value;
            const calStart  = body.querySelector('#tws-cal-start').value;
            const calEnd    = body.querySelector('#tws-cal-end').value;
            const calScroll = body.querySelector('#tws-cal-scroll').value;
            const calView   = body.querySelector('#tws-cal-view').value;
            const calSlot   = body.querySelector('#tws-cal-slot').value;
            if (isNaN(notifVal) || notifVal < 0) { status.textContent = 'Invalid timeout'; return; }
            status.textContent = 'Saving…';
            try {
                const r = await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        notification_timeout: notifVal,
                        kanban_columns:       kanbanVal,
                        cal_day_start:        calStart,
                        cal_day_end:          calEnd,
                        cal_scroll_time:      calScroll,
                        cal_default_view:     calView,
                        cal_slot_duration:    calSlot,
                    }),
                });
                const d = await r.json();
                if (d.success) {
                    window.twNotifTimeout = notifVal;
                    status.textContent = 'Saved';
                    setTimeout(() => { status.textContent = ''; }, 2000);
                } else {
                    status.textContent = d.error || 'Error';
                }
            } catch { status.textContent = 'Network error'; }
        });
    }

    // ── Sync dialog ───────────────────────────────────────────────────────────
    function openSyncDialog() {
        const dialog    = document.getElementById('tw-sync-dialog');
        const btn       = document.getElementById('tw-sync-now');
        const logBtn    = document.getElementById('tw-sync-log');
        const undoBtn   = document.getElementById('tw-sync-undo');
        const output    = document.getElementById('tw-sync-output');
        const method    = document.getElementById('tw-sync-method');
        const changesEl = document.getElementById('tw-sync-changes');
        const comment   = document.getElementById('tw-sync-comment');
        const closeBtn  = document.getElementById('tw-sync-close');
        if (!dialog) return;

        output.style.display  = 'none';
        output.textContent    = '';
        comment.value         = '';
        btn.disabled          = false;
        btn.textContent       = 'Sync Now';
        changesEl.textContent = 'Loading…';

        fetch('/api/sync/info').then(r => r.json())
            .then(d => { method.textContent = `Method: ${d.method}`; })
            .catch(() => { method.textContent = ''; });

        fetch('/api/sync/status').then(r => r.json()).then(d => {
            if (!d.git) { changesEl.textContent = ''; return; }
            const STATUS_LABEL = { M: 'modified', A: 'added', D: 'deleted', '?': 'untracked' };
            const parts = [];
            if (d.files?.length) {
                const rows = d.files.map(f => {
                    const label = STATUS_LABEL[f.status] || f.status;
                    return `<span class="sync-file-row">` +
                        `<span class="sync-file-status sync-fs-${f.status.toLowerCase()}">${label}</span>` +
                        `<span class="sync-file-name">${f.path}</span></span>`;
                }).join('');
                parts.push(`<div class="sync-files-section">` +
                    `<div class="sync-files-label">${d.files.length} file${d.files.length !== 1 ? 's' : ''} changed</div>` +
                    `${rows}</div>`);
            }
            if (d.unpushed) parts.push(
                `<div class="sync-unpushed">${d.unpushed} unpushed commit${d.unpushed !== 1 ? 's' : ''}</div>`);
            changesEl.innerHTML = parts.length
                ? parts.join('')
                : '<span class="sync-uptodate">Up to date</span>';
        }).catch(() => { changesEl.textContent = ''; });

        dialog.style.display = 'flex';
        const close = () => { dialog.style.display = 'none'; };
        closeBtn.onclick = close;
        dialog.onclick   = (e) => { if (e.target === dialog) close(); };

        btn.onclick = () => {
            const msg = comment.value.trim();
            btn.disabled    = true;
            btn.textContent = 'Syncing…';
            output.style.display = 'none';
            fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg })
            }).then(r => r.json()).then(data => {
                output.textContent   = data.output || (data.success ? 'Sync complete.' : 'Sync failed.');
                output.style.display = 'block';
                btn.textContent      = data.success ? 'Sync Now' : 'Retry';
                btn.disabled         = false;
                if (data.success) {
                    comment.value = '';
                    pollSyncStatus();
                    document.dispatchEvent(new CustomEvent('tw-sync-complete'));
                }
            }).catch(err => {
                output.textContent   = 'Error: ' + err;
                output.style.display = 'block';
                btn.textContent      = 'Retry';
                btn.disabled         = false;
            });
        };

        logBtn.onclick = () => {
            logBtn.disabled = true;
            fetch('/api/sync/log').then(r => r.json()).then(d => {
                output.textContent   = d.log || '(no log)';
                output.style.display = 'block';
            }).catch(err => {
                output.textContent   = 'Error: ' + err;
                output.style.display = 'block';
            }).finally(() => { logBtn.disabled = false; });
        };

        undoBtn.onclick = () => {
            if (!confirm('Undo the last task modification?')) return;
            undoBtn.disabled    = true;
            undoBtn.textContent = 'Undoing…';
            fetch('/api/sync/undo', { method: 'POST' }).then(r => r.json()).then(d => {
                output.textContent   = d.output || (d.success ? 'Undone.' : 'Undo failed.');
                output.style.display = 'block';
                if (d.success) document.dispatchEvent(new CustomEvent('tw-sync-complete'));
            }).catch(err => {
                output.textContent   = 'Error: ' + err;
                output.style.display = 'block';
            }).finally(() => {
                undoBtn.disabled    = false;
                undoBtn.textContent = 'Undo';
            });
        };
    }

    // ── Hook prompt system ────────────────────────────────────────────────────
    const _promptQueue = [];
    let   _promptActive = false;

    function _buildPromptUI() {
        if (document.getElementById('tw-prompt-backdrop')) return;
        const el = document.createElement('div');
        el.innerHTML =
            `<div id="tw-prompt-backdrop">` +
              `<div id="tw-prompt-dialog">` +
                `<div id="tw-prompt-header"><span class="tw-prompt-icon">❓</span><span id="tw-prompt-title">Hook Prompt</span></div>` +
                `<div id="tw-prompt-body">` +
                  `<div id="tw-prompt-question"></div>` +
                  `<div id="tw-prompt-context"></div>` +
                  `<div id="tw-prompt-timer"><div id="tw-prompt-timer-bar" style="width:100%"></div></div>` +
                  `<div id="tw-prompt-actions">` +
                    `<button class="tw-prompt-btn tw-prompt-btn-no"  id="tw-prompt-no">No</button>` +
                    `<button class="tw-prompt-btn tw-prompt-btn-yes" id="tw-prompt-yes">Yes</button>` +
                  `</div>` +
                `</div>` +
              `</div>` +
            `</div>`;
        document.body.appendChild(el.firstChild);
    }

    function _showNextPrompt() {
        if (_promptActive || _promptQueue.length === 0) return;
        const prompt = _promptQueue.shift();
        _promptActive = true;
        _buildPromptUI();

        document.getElementById('tw-prompt-question').textContent = prompt.question || '';
        const ctx = document.getElementById('tw-prompt-context');
        ctx.textContent = prompt.context || '';
        ctx.style.display = prompt.context ? '' : 'none';

        const isDefaultYes = (prompt.default || 'no') === 'yes';
        const yesBtn = document.getElementById('tw-prompt-yes');
        const noBtn  = document.getElementById('tw-prompt-no');
        yesBtn.style.order = isDefaultYes ? '2' : '1';
        noBtn.style.order  = isDefaultYes ? '1' : '2';

        document.getElementById('tw-prompt-backdrop').classList.add('open');

        // Countdown timer
        const timeout = (prompt.timeout || 30);
        const bar = document.getElementById('tw-prompt-timer-bar');
        bar.style.transition = 'none';
        bar.style.width = '100%';
        requestAnimationFrame(() => {
            bar.style.transition = `width ${timeout}s linear`;
            bar.style.width = '0%';
        });

        let answered = false;
        const timer = setTimeout(() => answer(prompt.default || 'no'), timeout * 1000);

        function answer(val) {
            if (answered) return;
            answered = true;
            clearTimeout(timer);
            document.getElementById('tw-prompt-backdrop').classList.remove('open');
            fetch('/api/hook-answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: prompt.id, answer: val })
            }).catch(() => {});
            _promptActive = false;
            _showNextPrompt();
        }

        yesBtn.onclick = () => answer('yes');
        noBtn.onclick  = () => answer('no');
    }

    function _initSSE() {
        const es = new EventSource('/api/events');
        es.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'confirm') {
                    _promptQueue.push(msg);
                    _showNextPrompt();
                } else if (msg.type === 'info') {
                    document.dispatchEvent(new CustomEvent('tw-show-notification',
                        { detail: { message: msg.question, type: 'info' } }));
                }
            } catch (_) {}
        };
        es.onerror = () => {
            // Browser auto-reconnects — no action needed
        };
    }

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    const _PAGE_KEYS = {
        'L': '/',
        'K': '/kanban.html',
        'A': '/agenda.html',
        'C': '/calendar-planner.html',
    };
    const _CAL_KEYS = { 'D': 'day', 'W': 'week', 'M': 'month' };

    function _initKeys() {
        document.addEventListener('keydown', (e) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const tag = (e.target.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
            // Also suppress when focus is inside any open modal/dialog (e.g. CodeMirror annotation field)
            if (e.target.closest('.modal, .task-editor-backdrop, [role="dialog"]')) return;

            const k = e.key;

            if (_PAGE_KEYS[k]) {
                e.preventDefault();
                window.location.href = _PAGE_KEYS[k];
            } else if (_CAL_KEYS[k] && typeof changeView === 'function') {
                e.preventDefault();
                changeView(_CAL_KEYS[k]);
            } else if (k === 'a') {
                e.preventDefault();
                document.dispatchEvent(new CustomEvent('tw-open-add'));
            } else if (k === 'f') {
                e.preventDefault();
                const fi = document.getElementById('tw-filter-input');
                if (fi) { fi.focus(); fi.select(); }
            } else if (k === 'c') {
                e.preventDefault();
                document.querySelector('.tw-ctx-btn')?.focus();
            } else if (k === 's') {
                e.preventDefault();
                document.querySelector('.tw-status-btn')?.focus();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { init(); _initSSE(); _initKeys(); _initTerminalVisibility(); });
    } else {
        init();
        _initSSE();
        _initKeys();
        _initTerminalVisibility();
    }
}());
