'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const KB_SORT_OPTIONS = [
    { key: 'manual',   label: 'Manual' },
    { key: 'urgency',  label: 'Urgency' },
    { key: 'due',      label: 'Due date' },
    { key: 'priority', label: 'Priority' },
    { key: 'project',  label: 'Project' },
    { key: 'desc',     label: 'Description' },
    { key: 'end',      label: 'Completed' },
];
// Lanes that mean more than a state, by name (app.py /api/kanban/move): into `started` starts the
// task, out of it stops it; `done` shows completed tasks, newest first, a page at a time
const KB_STARTED   = 'started';
const KB_DONE      = 'done';
const KB_DONE_PAGE = 50;
// Saturated-enough to read but dark enough for white text
const KB_COL_COLORS = [
    '#1a4a6e','#1a5a2e','#6a4a14','#3a1a6e','#6e1a1a','#1a5a5a','#5a5a1a','#2e1a5a',
];
const KB_MIN_COL_W = 220;
const KB_COL_GAP   = 10;

// ── Globals ───────────────────────────────────────────────────────────────────
let kbColumns       = [];
let kbAllTasks      = [];   // pending tasks in the context: every lane but Done
let kbDoneTasks     = [];   // completed tasks in the context, newest first, the pages loaded so far
let kbDoneTotal     = 0;    // how many completed tasks the context has
let _kbDoneLoading  = false;
let kbGrandTotal    = null; // every pending task: the count's denominator, as on the List
let kbManualOrder   = {};   // { col: [uuid, ...] } loaded from server
let kbColOffset     = 0;
let kbFocusedColIdx = 0;
let _kbResizeObs    = null;
let _kbDragMoveOff   = null;
let _kbIsDragging    = false; // true only between onStart and onEnd
let _kbNavDropTarget = null;  // state string when pointer is over nav bar, else null
let _kbNavSortable   = null;  // Sortable instance on #kb-nav-cols (nav drop zone)
const _KB_FOCUS_KEY  = 'tw-kb-focus-col'; // persists focused column across page navigation
let taskEditor;  // global — TaskCardManager's edit handler references this by name

const kbCardManager = new TaskCardManager(new TaskActionHandler({
    onTaskUpdate:     () => kbReload(),
    onTaskDelete:     () => kbReload(),
    showNotification: (msg, type) =>
        document.dispatchEvent(new CustomEvent('tw-show-notification', { detail: { message: msg, type } })),
}));

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    taskEditor = new TaskEditor({
        showAllFields:  true,
        priorityFormat: 'letters',
        language:       'en',
        modalId:        'unified-task-editor',
        onSaveSuccess:  () => kbReload(true),
        onSaveError:    (err) => document.dispatchEvent(new CustomEvent('tw-show-notification',
                            { detail: { message: err, type: 'error' } })),
        onLogSuccess:   () => document.dispatchEvent(new CustomEvent('tw-show-notification',
                            { detail: { message: 'Task logged', type: 'success' } })),
        onCancel:       () => {},
    });

    // clientOnly = text/project/tags/priority → only unassigned needs re-render
    // !clientOnly = context changed → full server re-fetch, preserve scroll/focus
    document.addEventListener('tw-filter-change', e => {
        if (e.detail && e.detail.clientOnly) kbRerenderLanes();
        else kbReload(true);
    });

    document.addEventListener('tw-open-add', () => { if (taskEditor) taskEditor.show(null); });

    _kbSetupSwipe();
    kbReload();
});

// ── Data ──────────────────────────────────────────────────────────────────────
async function kbReload(preserveView = false) {
    const savedOffset = kbColOffset;
    const savedFocus  = kbFocusedColIdx;
    try {
        const navState   = window.twNav ? window.twNav.getState() : {};
        const context    = (navState.context || '').trim();
        // Kanban's lanes are pending tasks, Done's completed ones; the status filter is suppressed here
        const swimParams = 'status=pending' + (context ? '&context=' + encodeURIComponent(context) : '');
        const [colsData, swimData, orderData, totalData, doneData] = await Promise.all([
            fetch('api/kanban/columns').then(r => r.json()),
            fetch('api/tasks?' + swimParams).then(r => r.json()),
            fetch('api/kanban/order').then(r => r.json()),
            fetch('api/tasks?status=pending').then(r => r.json()),
            // a reload keeps as many Done cards as were loaded, so its scroll survives
            _kbFetchDone(0, Math.max(KB_DONE_PAGE, kbDoneTasks.length)),
        ]);
        kbColumns       = colsData.columns    || [];
        kbAllTasks      = swimData.tasks      || [];
        kbManualOrder   = orderData.order     || {};
        kbGrandTotal    = totalData.success ? totalData.tasks.length : null;
        kbDoneTasks     = doneData.success ? doneData.tasks : [];
        kbDoneTotal     = doneData.success ? doneData.total : 0;
        // On fresh load: the lane this tab last focused, else todo, else the first lane
        if (!preserveView) {
            const savedCol = sessionStorage.getItem(_KB_FOCUS_KEY);
            let idx = savedCol === '' ? 0
                    : savedCol !== null && kbColumns.includes(savedCol) ? kbColumns.indexOf(savedCol) + 1
                    : -1;
            if (idx < 0) idx = kbColumns.includes('todo') ? kbColumns.indexOf('todo') + 1
                             : (kbColumns.length > 0 ? 1 : 0);
            kbFocusedColIdx = idx;
            kbColOffset     = kbColumns.length > 0 ? 1 : 0;
        } else {
            kbFocusedColIdx = savedFocus;
            kbColOffset     = savedOffset;
        }
        kbRenderBoard();
        // One column on a phone: the offset alone used to show backlog whatever had focus
        if (!preserveView) _kbBringIntoView(kbFocusedColIdx);
        _kbSetCount();
    } catch (e) {
        console.error('Kanban load failed:', e);
        document.dispatchEvent(new CustomEvent('tw-show-notification',
            { detail: { message: 'Failed to load kanban', type: 'error' } }));
    }
}

// ── Lanes ─────────────────────────────────────────────────────────────────────
// The nav filter (TW.filter, the List's rules) applies to every lane, Done too.
function kbNavFilter(tasks) {
    return TW.filter.navTasks(tasks);
}

// A lane's tasks: Done is the completed ones; Unassigned is every pending task whose state is no
// other lane's (a pending state:done task included: Done is completed tasks now)
function kbLaneTasks(col, { filtered = true } = {}) {
    const f = filtered ? kbNavFilter : (x => x);
    if (col === KB_DONE) return f(kbDoneTasks);
    if (col === '') {
        const lanes = new Set(kbColumns.filter(c => c !== KB_DONE));
        return f(kbAllTasks.filter(t => !lanes.has(t.state || '')));
    }
    return f(kbAllTasks.filter(t => (t.state || '') === col));
}

// A lane reordered by hand: `visible` is the new order of the cards on screen. The filter may hide
// some of the lane, and tasks outside the context are in the saved order too: they keep their
// places, and the visible cards fill the slots the visible cards had.
function _kbReordered(col, visible) {
    const old  = kbManualOrder[col] || [];
    const seen = new Set(old);
    const seq  = [...old, ...kbSort(kbLaneTasks(col, { filtered: false }), col, 'manual')
                              .map(t => t.uuid).filter(u => !seen.has(u))];
    const vis  = new Set(visible);
    let i = 0;
    const order = seq.map(u => vis.has(u) ? visible[i++] : u);
    kbManualOrder[col] = order;
    kbSetSort(col, 'manual');
    _kbSaveOrder(col, order);
    // reflect 'manual' in the sort popup without a full re-render
    document.querySelector(`.kb-sort-popup[data-kb-popup="${col}"]`)
        ?.querySelectorAll('input[type="radio"]')
        .forEach(r => { r.checked = r.value === 'manual'; });
}

function _kbFetchDone(offset, limit) {
    const ctx = ((window.twNav ? window.twNav.getState() : {}).context || '').trim();
    const q = `status=completed&sort=end&limit=${limit}&offset=${offset}` +
              (ctx ? '&context=' + encodeURIComponent(ctx) : '');
    return fetch('api/tasks?' + q).then(r => r.json()).catch(() => ({ success: false }));
}

// The next page of Done, when its lane scrolls near the bottom (or its button is pressed)
async function _kbLoadMoreDone() {
    if (_kbDoneLoading || kbDoneTasks.length >= kbDoneTotal || !kbColumns.includes(KB_DONE)) return;
    _kbDoneLoading = true;
    try {
        const d = await _kbFetchDone(kbDoneTasks.length, KB_DONE_PAGE);
        if (d.success) {
            const seen = new Set(kbDoneTasks.map(t => t.uuid));
            kbDoneTasks = kbDoneTasks.concat(d.tasks.filter(t => !seen.has(t.uuid)));
            kbDoneTotal = d.total;
            _kbRerenderCol(KB_DONE);
        }
    } finally {
        _kbDoneLoading = false;
    }
}

// ── Sort / view persistence ───────────────────────────────────────────────────
// Manual became the default (2026-11-23): forget each browser's older choices once
try {
    if (!localStorage.getItem('tw-kb-sortreset-1')) {
        Object.keys(localStorage).filter(k => k.startsWith('tw-kb-sort-'))
            .forEach(k => localStorage.removeItem(k));
        localStorage.setItem('tw-kb-sortreset-1', '1');
    }
} catch {}
function kbGetSort(col) {
    return localStorage.getItem(`tw-kb-sort-${col}`) || (col === KB_DONE ? 'end' : 'manual');
}
function kbSetSort(col, key) { localStorage.setItem(`tw-kb-sort-${col}`, key); }
function kbGetView(col) { return localStorage.getItem(`tw-kb-view-${col}`) || 'card'; }
function kbSetView(col, mode) { localStorage.setItem(`tw-kb-view-${col}`, mode); }

function kbSort(tasks, col, key = kbGetSort(col)) {
    if (key === 'manual') {
        const ord = kbManualOrder[col] || [];
        return [...tasks].sort((a, b) => {
            const ai = ord.indexOf(a.uuid), bi = ord.indexOf(b.uuid);
            if (ai === -1 && bi === -1) return (b.urgency || 0) - (a.urgency || 0);  // never placed
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
        });
    }
    return [...tasks].sort((a, b) => {
        switch (key) {
            case 'urgency':  return (b.urgency || 0) - (a.urgency || 0);
            case 'due':      return !a.due ? 1 : !b.due ? -1 : a.due < b.due ? -1 : 1;
            case 'priority': return TW.sort.priRank(b.priority) - TW.sort.priRank(a.priority);
            case 'project':  return (a.project || '').localeCompare(b.project || '');
            case 'desc':     return (a.description || '').localeCompare(b.description || '');
            case 'end':      return (b.end || '').localeCompare(a.end || '');
            default:         return 0;
        }
    });
}

// ── Column color ──────────────────────────────────────────────────────────────
// colorIdx -1 = unassigned (no override), 0+ = workflow columns
function _kbColColor(colorIdx) {
    if (colorIdx < 0) return null;
    return KB_COL_COLORS[colorIdx % KB_COL_COLORS.length];
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function kbRenderBoard() {
    const board = document.getElementById('kb-board');
    board.innerHTML = '';

    board.appendChild(_kbMakeCol('', 'Unassigned', kbLaneTasks(''), true, -1));
    kbColumns.forEach((col, i) =>
        board.appendChild(_kbMakeCol(col, col, kbLaneTasks(col), false, i)));

    _kbInitResize();
    _kbUpdateNavPills();
    _kbApplyFocus();
}

// The nav filter changed (no refetch): redraw every lane, keeping each one's scroll
function kbRerenderLanes() {
    ['', ...kbColumns].forEach(col => _kbRerenderCol(col));
}

function _kbRerenderCol(col) {
    const board    = document.getElementById('kb-board');
    const existing = [...board.querySelectorAll('.kb-col')].find(c => c.dataset.col === col);
    if (!existing) return;
    const scroll = existing.querySelector('.kb-col-body')?.scrollTop || 0;
    const fresh  = col === '' ? _kbMakeCol('', 'Unassigned', kbLaneTasks(''), true, -1)
                              : _kbMakeCol(col, col, kbLaneTasks(col), false, kbColumns.indexOf(col));
    board.replaceChild(fresh, existing);
    fresh.querySelector('.kb-col-body').scrollTop = scroll;
    _kbApplyVisibility();
    _kbApplyFocus();
    _kbSetCount();
}

// Counter: cards in the workflow lanes (not Unassigned, not Done) / every pending task, as the List
function _kbSetCount() {
    const shown = [...document.querySelectorAll('#kb-board .kb-col')]
        .filter(c => c.dataset.col !== '' && c.dataset.col !== KB_DONE)
        .reduce((n, c) => n + c.querySelectorAll('.kb-col-body > .task-card:not(.task-card-dep)').length, 0);
    window.twNav?.setCount(shown, kbGrandTotal ?? kbAllTasks.length);
}

function _kbColKey(col) { return col === '' ? '__unassigned__' : col; }

function _kbMakeCol(col, label, tasks, isUnassigned, colorIdx) {
    const view   = kbGetView(col);
    const sorted = kbSort(tasks, col);
    const colKey = _kbColKey(col);
    const color  = _kbColColor(colorIdx);

    const div = document.createElement('div');
    div.className = 'kb-col';
    div.dataset.col = col;

    // header
    const hdr = document.createElement('div');
    hdr.className = 'kb-col-hdr' + (isUnassigned ? ' kb-col-hdr--unassigned' : '');
    if (color) hdr.style.background = color;
    hdr.innerHTML =
        `<span class="kb-col-count">${col === KB_DONE && kbDoneTotal !== tasks.length
            ? `${tasks.length}/${kbDoneTotal}` : tasks.length}</span>` +
        `<span class="kb-col-name">${label}</span>` +
        `<div class="kb-col-ctrl">` +
            `<button class="kb-btn kb-btn-sort" data-col="${col}" title="Sort">↕</button>` +
            `<button class="kb-btn${view === 'card' ? ' active' : ''}" data-kb-view="card" data-col="${col}" title="Cards">⊞</button>` +
            `<button class="kb-btn${view === 'list' ? ' active' : ''}" data-kb-view="list" data-col="${col}" title="List">☰</button>` +
        `</div>`;
    div.appendChild(hdr);

    // sort popup
    const popup = document.createElement('div');
    popup.className = 'kb-sort-popup';
    popup.dataset.kbPopup = col;
    popup.hidden = true;
    popup.innerHTML = KB_SORT_OPTIONS.map(o =>
        `<label class="kb-sort-opt"><input type="radio" name="kb-sort-${colKey}" value="${o.key}"${kbGetSort(col) === o.key ? ' checked' : ''}> ${o.label}</label>`
    ).join('');
    div.appendChild(popup);

    // card body
    const body = document.createElement('div');
    body.className = 'kb-col-body' + (view === 'list' ? ' list-view' : '');
    body.dataset.col = col;
    if (sorted.length) {
        const allLookup = new Map(kbAllTasks.map(t => [t.uuid, t]));
        sorted.forEach(t => kbCardManager.appendWithDeps(body, t, allLookup));
    } else {
        body.innerHTML = `<div class="kb-empty">${isUnassigned ? 'No unassigned tasks' : 'Empty'}</div>`;
    }
    if (col === KB_DONE) {
        if (kbDoneTasks.length < kbDoneTotal) {
            const more = document.createElement('button');
            more.className = 'kb-btn kb-more';
            more.textContent = `More (${kbDoneTasks.length} of ${kbDoneTotal} loaded)`;
            more.addEventListener('click', () => _kbLoadMoreDone());
            body.appendChild(more);
        }
        // a page ahead: load the next one before the reader reaches the end
        body.addEventListener('scroll', () => {
            if (body.scrollHeight - body.scrollTop - body.clientHeight < body.clientHeight) _kbLoadMoreDone();
        }, { passive: true });
    }
    div.appendChild(body);

    new Sortable(body, {
        group:         'kanban',
        sort:          col !== KB_DONE,   // Done is in completion order
        filter:        '.kb-more, .kb-empty',
        preventOnFilter: false,
        animation:     150,
        forceFallback: true,   // use pointer tracking so pointermove fires during drag
        ghostClass:    'sortable-ghost',
        chosenClass:   'sortable-chosen',
        delay:         150,
        delayOnTouchOnly: false,
        onStart(evt) { _kbDragStart(evt.item.dataset.taskId); },
        onEnd(evt) {
            _kbDragEnd();  // cleanup move listeners, nav styling
            // Nav drops are handled by _kbNavSortable onAdd — skip here to avoid double-write
            if (evt.to.id === 'kb-nav-cols') return;
            if (evt.from !== evt.to) {
                // dropped in a different column — write state then reload to sync local arrays
                _kbMove(evt.item.dataset.taskId, evt.to.dataset.col).then(() => kbReload(true));
            } else if (evt.oldIndex !== evt.newIndex) {
                // within-column reorder — save manual order, no task mutation
                _kbReordered(evt.to.dataset.col,
                    [...evt.to.querySelectorAll('[data-task-id]')].map(el => el.dataset.taskId));
            }
        },
    });

    return div;
}

// ── Column focus ──────────────────────────────────────────────────────────────
function _kbSetFocus(idx) {
    const board = document.getElementById('kb-board');
    const cols  = [...board.querySelectorAll('.kb-col')];
    kbFocusedColIdx = Math.max(0, Math.min(idx, cols.length - 1));
    _kbBringIntoView(kbFocusedColIdx);
    _kbApplyFocus();
}

function _kbBringIntoView(idx) {
    const maxVis = _kbMaxVisible();
    if (idx < kbColOffset) kbColOffset = idx;
    else if (idx >= kbColOffset + maxVis) kbColOffset = idx - maxVis + 1;
    _kbApplyVisibility();
}

// Returns the state-string of the currently focused column
function _kbFocusedColValue() {
    const board = document.getElementById('kb-board');
    return [...board.querySelectorAll('.kb-col')][kbFocusedColIdx]?.dataset.col ?? null;
}

function _kbApplyFocus() {
    const board = document.getElementById('kb-board');
    const cols  = [...board.querySelectorAll('.kb-col')];
    cols.forEach((c, i) => c.classList.toggle('kb-col--focused', i === kbFocusedColIdx));
    // Persist so focus survives Agenda → back navigation
    const focusedCol = cols[kbFocusedColIdx]?.dataset.col;
    if (focusedCol !== undefined) sessionStorage.setItem(_KB_FOCUS_KEY, focusedCol);
    _kbUpdateNavPillState();
}

// ── Swipe between lanes (touch) ───────────────────────────────────────────────
// A decided sideways swipe moves the focus one lane, sliding the board, as the Calendar's swipe
// changes the week (calendar-planner.js setupTouch, the same rules): the board follows the finger,
// and on release a swipe past KB_SWIPE_MIN px and a quarter of the width, mostly sideways, and quick
// (or past half the width) goes; anything else springs back. A held card is Sortable's drag
// (_kbIsDragging), and a vertical start scrolls the lane. Past either end the board resists.
const KB_GRAB_SLOP = 10, KB_SWIPE_MIN = 60, KB_SWIPE_WIDTH = 0.25, KB_SWIPE_MS = 600;
let _kbSliding = false;

function _kbSetupSwipe() {
    const board = document.getElementById('kb-board');
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    let t = null;   // this touch: where and when it started, axis 'x' | 'y' once decided
    const lanes = () => board.querySelectorAll('.kb-col').length;

    function slide(to, ms, then) {
        board.style.transition = still.matches || !ms ? 'none' : `transform ${ms}ms ease-out`;
        board.style.transform  = to ? `translateX(${to}px)` : '';
        if (then) setTimeout(then, still.matches ? 0 : ms);
    }
    function back() {
        if (board.style.transform) slide(0, 150, () => { board.style.transition = ''; });
    }
    function go(dir) {   // 1 next lane, -1 previous
        const next = kbFocusedColIdx + dir;
        if (next < 0 || next >= lanes()) { back(); return; }
        const w = board.clientWidth;
        _kbSliding = true;
        slide(-dir * w, 120, () => {
            _kbSetFocus(next);
            slide(dir * w, 0);
            board.offsetWidth;   // start the slide in from there
            slide(0, 160, () => { board.style.transition = ''; _kbSliding = false; });
        });
    }
    // The moves go to the element the finger landed on, even after a reload redraws its lane and
    // takes it out of the page (then they never bubble up): listen there, as the Calendar does.
    function move(e) {
        if (!t) return;
        if (_kbIsDragging || e.touches.length !== 1) { t = null; back(); return; }
        const p = e.touches[0], dx = p.clientX - t.x, dy = p.clientY - t.y;
        if (!t.axis) {
            if (Math.hypot(dx, dy) < KB_GRAB_SLOP) return;
            t.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        }
        if (t.axis !== 'x') return;
        if (e.cancelable) e.preventDefault();
        const atEnd = (dx > 0 && kbFocusedColIdx === 0) || (dx < 0 && kbFocusedColIdx === lanes() - 1);
        slide(atEnd ? dx / 3 : dx, 0);
    }
    function end(e) {
        for (const [type, fn] of [['touchmove', move], ['touchend', end], ['touchcancel', end]])
            e.target.removeEventListener(type, fn);
        if (!t || t.axis !== 'x') { t = null; back(); return; }
        const p = e.changedTouches[0], dx = p.clientX - t.x, dy = p.clientY - t.y, w = board.clientWidth;
        const far = Math.abs(dx) >= Math.max(KB_SWIPE_MIN, w * KB_SWIPE_WIDTH) && Math.abs(dx) > 2 * Math.abs(dy);
        const decided = e.type === 'touchend' && far && (e.timeStamp - t.at <= KB_SWIPE_MS || Math.abs(dx) >= w / 2);
        t = null;
        decided ? go(dx < 0 ? 1 : -1) : back();
    }
    board.addEventListener('touchstart', e => {
        const p = e.touches[0];
        t = e.touches.length === 1 && !_kbSliding ? { x: p.clientX, y: p.clientY, at: e.timeStamp, axis: null } : null;
        e.target.addEventListener('touchmove', move, { passive: false });
        e.target.addEventListener('touchend', end);
        e.target.addEventListener('touchcancel', end);
    }, { passive: true });
}

// ── Column visibility (ResizeObserver) ────────────────────────────────────────
function _kbInitResize() {
    const board = document.getElementById('kb-board');
    if (_kbResizeObs) _kbResizeObs.disconnect();
    // ResizeObserver handles only layout recalculation — never _kbCenterFocused().
    // _kbCenterFocused() is wired exclusively to genuine window resize events (below).
    _kbResizeObs = new ResizeObserver(() => _kbApplyVisibility());
    _kbResizeObs.observe(board);
}

window.addEventListener('resize', () => { _kbCenterFocused(); _kbApplyVisibility(); });

function _kbMaxVisible() {
    const board = document.getElementById('kb-board');
    const w     = board.clientWidth - 24; // subtract padding (2×12px)
    return Math.max(1, Math.floor((w + KB_COL_GAP) / (KB_MIN_COL_W + KB_COL_GAP)));
}

// On window resize: center the focused swimlane; Unassigned (idx 0) hides first.
// Not called during manual pan — only from ResizeObserver.
function _kbCenterFocused() {
    const board  = document.getElementById('kb-board');
    const cols   = [...board.querySelectorAll('.kb-col')];
    const total  = cols.length;
    const maxVis = _kbMaxVisible();
    if (total === 0) return;
    if (maxVis >= total) { kbColOffset = 0; return; }   // all fit — show Unassigned too
    // Center focused column; start at minimum 1 so Unassigned hides first
    const focus  = Math.max(1, Math.min(kbFocusedColIdx, total - 1));
    const half   = Math.floor(maxVis / 2);
    kbColOffset  = Math.max(1, Math.min(focus - half, total - maxVis));
}

function _kbApplyVisibility() {
    const board  = document.getElementById('kb-board');
    const cols   = [...board.querySelectorAll('.kb-col')];
    const maxVis = _kbMaxVisible();
    kbColOffset  = Math.min(kbColOffset, Math.max(0, cols.length - maxVis));
    cols.forEach((c, i) =>
        c.classList.toggle('kb-col--hidden', i < kbColOffset || i >= kbColOffset + maxVis));
    _kbUpdateNavPillState();
}

// ── Drag to nav pill ──────────────────────────────────────────────────────────
function _kbDragStart(_uuid) {
    _kbIsDragging    = true;
    _kbNavDropTarget = null;
    // kb-dragging is NOT set here — the move handler adds/removes it as the
    // pointer enters/leaves the nav so the stack only appears on demand.

    const nav = document.getElementById('kb-col-nav');
    let panTimer = null;

    const handler = e => {
        if (!_kbIsDragging) return;
        const cx = e.clientX ?? e.touches?.[0]?.clientX;
        const cy = e.clientY ?? e.touches?.[0]?.clientY;
        if (cx == null) return;

        const navRect = nav.getBoundingClientRect();
        const onNav   = cy >= navRect.top && cy <= navRect.bottom &&
                        cx >= navRect.left && cx <= navRect.right;

        // Transform nav to vertical stack only while pointer is inside it
        nav.classList.toggle('kb-dragging', onNav);

        document.querySelectorAll('.kb-nav-pill.drag-target')
            .forEach(p => p.classList.remove('drag-target'));

        if (onNav) {
            // Check both X and Y — in vertical stack all pills share the same X range;
            // only the Y position distinguishes which row is hovered
            const hovered = [...nav.querySelectorAll('.kb-nav-pill')].find(p => {
                const r = p.getBoundingClientRect();
                return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
            });
            hovered?.classList.add('drag-target');
            _kbNavDropTarget = hovered ? hovered.dataset.kbCol : null;
        } else {
            _kbNavDropTarget = null;
        }

        // Edge auto-pan — only fires when not over the nav bar
        if (panTimer) { clearTimeout(panTimer); panTimer = null; }
        if (!onNav) {
            const board  = document.getElementById('kb-board');
            const rect   = board.getBoundingClientRect();
            const cols   = board.querySelectorAll('.kb-col').length;
            const maxVis = _kbMaxVisible();
            const ZONE   = 72;
            if (cx < rect.left + ZONE && kbColOffset > 0) {
                panTimer = setTimeout(() => { kbColOffset--; _kbApplyVisibility(); }, 500);
            } else if (cx > rect.right - ZONE && kbColOffset + maxVis < cols) {
                panTimer = setTimeout(() => { kbColOffset++; _kbApplyVisibility(); }, 500);
            }
        }
    };

    // pointermove covers mouse+touch on modern browsers; touchmove as fallback for older Safari
    // mousemove is intentionally excluded — compat mousemove after touchend fires at wrong coords
    window.addEventListener('pointermove', handler, true);
    window.addEventListener('touchmove',   handler, { capture: true, passive: true });
    _kbDragMoveOff = () => {
        window.removeEventListener('pointermove', handler, true);
        window.removeEventListener('touchmove',   handler, true);
        if (panTimer) clearTimeout(panTimer);
    };
}

// Cleanup only — nav drops are handled by the #kb-nav-cols Sortable onAdd.
function _kbDragEnd() {
    _kbIsDragging    = false;
    _kbNavDropTarget = null;
    if (_kbDragMoveOff) { _kbDragMoveOff(); _kbDragMoveOff = null; }
    document.getElementById('kb-col-nav').classList.remove('kb-dragging');
    document.querySelectorAll('.kb-nav-pill.drag-target')
        .forEach(p => p.classList.remove('drag-target'));
}

// ── Column nav pills ──────────────────────────────────────────────────────────
function _kbUpdateNavPillState() {
    const pillEls = [...document.querySelectorAll('#kb-nav-cols .kb-nav-pill')];
    const maxVis  = _kbMaxVisible();
    pillEls.forEach((p, i) => {
        p.classList.toggle('active',  i >= kbColOffset && i < kbColOffset + maxVis);
        p.classList.toggle('focused', i === kbFocusedColIdx);
    });
}

function _kbUpdateNavPills() {
    const pills = document.getElementById('kb-nav-cols');
    const board = document.getElementById('kb-board');
    const cols  = [...board.querySelectorAll('.kb-col')];

    // Rebuild pills HTML
    pills.innerHTML = cols.map((c, i) => {
        const label = c.dataset.col || 'Unassigned';
        const color = _kbColColor(i - 1);
        const bg    = color ? `background:${color};border-color:${color};` : '';
        return `<button class="kb-nav-pill" data-kb-idx="${i}" data-kb-col="${c.dataset.col}" style="${bg}">${label}</button>`;
    }).join('');

    _kbUpdateNavPillState();

    pills.onclick = e => {
        const btn = e.target.closest('[data-kb-idx]');
        if (btn) _kbSetFocus(+btn.dataset.kbIdx);
    };

    // Reinitialise the nav drop zone Sortable (pills HTML was replaced above)
    if (_kbNavSortable) { _kbNavSortable.destroy(); _kbNavSortable = null; }
    const navEl = document.getElementById('kb-col-nav');
    _kbNavSortable = new Sortable(pills, {
        group:         { name: 'kanban', put: () => navEl.classList.contains('kb-dragging'), pull: false },
        animation:     0,
        forceFallback: true,
        draggable:     '.NONE',   // pills are not draggable — nav only accepts drops
        onAdd(evt) {
            const uuid = evt.item.dataset.taskId;
            let targetState = _kbNavDropTarget;
            if (targetState === null) {
                // Dropped in a gap — find nearest pill by vertical midpoint (stack layout)
                const r  = evt.item.getBoundingClientRect();
                const cy = r.top + r.height / 2;
                const nearest = [...pills.querySelectorAll('.kb-nav-pill')].reduce((best, p) => {
                    const pr = p.getBoundingClientRect();
                    const pc = pr.top + pr.height / 2;
                    return (!best || Math.abs(cy - pc) < Math.abs(cy - best.cy))
                        ? { el: p, cy: pc } : best;
                }, null);
                targetState = nearest?.el?.dataset.kbCol ?? null;
            }
            evt.item.remove();
            _kbNavDropTarget = null;
            if (uuid && targetState !== null) {
                _kbMove(uuid, targetState).then(() => kbReload(true));
            }
        },
    });
}

// ── UI event delegation ───────────────────────────────────────────────────────
document.addEventListener('click', e => {
    // Focus the column that was clicked
    const colEl = e.target.closest('.kb-col');
    if (colEl) {
        const board = document.getElementById('kb-board');
        const idx   = [...board.querySelectorAll('.kb-col')].indexOf(colEl);
        if (idx >= 0 && idx !== kbFocusedColIdx) _kbSetFocus(idx);
    }

    // Per-card expand/collapse — click anywhere on card except action buttons
    const card = e.target.closest('.kb-col-body .task-card');
    if (card && !e.target.closest('[data-task-action]')) {
        const listView = card.closest('.kb-col-body')?.classList.contains('list-view');
        if (listView) card.classList.toggle('expanded');
        else          card.classList.toggle('collapsed');
        return;
    }

    const sortBtn = e.target.closest('.kb-btn-sort');
    if (sortBtn) {
        const popup = document.querySelector(`.kb-sort-popup[data-kb-popup="${sortBtn.dataset.col}"]`);
        if (popup) popup.hidden = !popup.hidden;
        return;
    }
    if (!e.target.closest('.kb-sort-popup') && !e.target.closest('.kb-btn-sort'))
        document.querySelectorAll('.kb-sort-popup').forEach(p => p.hidden = true);

    const viewBtn = e.target.closest('[data-kb-view]');
    if (viewBtn) {
        const col  = viewBtn.dataset.col;
        const mode = viewBtn.dataset.kbView;
        kbSetView(col, mode);
        const colDiv = document.querySelector(`.kb-col[data-col="${col}"]`);
        if (colDiv) {
            colDiv.querySelector('.kb-col-body').classList.toggle('list-view', mode === 'list');
            colDiv.querySelectorAll('[data-kb-view]').forEach(b =>
                b.classList.toggle('active', b.dataset.kbView === mode));
        }
    }
});

document.addEventListener('change', e => {
    const radio = e.target.closest('input[type="radio"][name^="kb-sort-"]');
    if (!radio) return;
    const colKey = radio.name.replace('kb-sort-', '');
    const col    = colKey === '__unassigned__' ? '' : colKey;
    kbSetSort(col, radio.value);
    document.querySelector(`.kb-sort-popup[data-kb-popup="${col}"]`).hidden = true;

    const colDiv = document.querySelector(`.kb-col[data-col="${col}"]`);
    if (!colDiv) return;
    _kbRerenderCol(col);
});

// Arrow keys: left/right = change focused column, up/down = scroll within it
document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); _kbSetFocus(kbFocusedColIdx - 1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); _kbSetFocus(kbFocusedColIdx + 1); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const board   = document.getElementById('kb-board');
        const focused = [...board.querySelectorAll('.kb-col')][kbFocusedColIdx];
        const body    = focused?.querySelector('.kb-col-body');
        if (body) { body.scrollTop += e.key === 'ArrowDown' ? 60 : -60; e.preventDefault(); }
    }
});

// ── API ───────────────────────────────────────────────────────────────────────
// Drag/drop (column body and nav pill) moves a card to a lane: the server decides what that
// means (state, start, done, reopen: /api/kanban/move). Everything else goes through kbCardManager.

async function _kbSaveOrder(col, uuids) {
    try {
        await fetch('api/kanban/order', {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ col, order: uuids }),
        });
    } catch {
        document.dispatchEvent(new CustomEvent('tw-show-notification',
            { detail: { message: 'Failed to save sort order', type: 'error' } }));
    }
}

async function _kbMove(uuid, to) {
    const d = await TW.api.write('POST', 'api/kanban/move', { uuid, to });
    if (TW.api.handleWriteResult(d)) return;
    if (!d.success) document.dispatchEvent(new CustomEvent('tw-show-notification',
        { detail: { message: `Error: ${d.error || d.message}`, type: 'error' } }));
}
