'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const KB_SORT_OPTIONS = [
    { key: 'manual',   label: 'Manual' },
    { key: 'urgency',  label: 'Urgency' },
    { key: 'due',      label: 'Due date' },
    { key: 'priority', label: 'Priority' },
    { key: 'project',  label: 'Project' },
    { key: 'desc',     label: 'Description' },
];
const KB_PRI_ORDER = ['1','2','3','4','5','6','H','M','L',''];
// Saturated-enough to read but dark enough for white text
const KB_COL_COLORS = [
    '#1a4a6e','#1a5a2e','#6a4a14','#3a1a6e','#6e1a1a','#1a5a5a','#5a5a1a','#2e1a5a',
];
const KB_MIN_COL_W = 220;
const KB_COL_GAP   = 10;

// ── Globals ───────────────────────────────────────────────────────────────────
let kbColumns       = [];
let kbAllTasks      = [];   // swimlane tasks — context-filtered, always pending
let kbUnassignedSrc = [];   // unassigned tasks — status-filtered, no context
let kbManualOrder   = {};   // { col: [uuid, ...] } loaded from server
let kbColOffset     = 0;
let kbFocusedColIdx = 0;
let _kbResizeObs     = null;
let _kbDragMoveOff   = null;
let _kbNavDropTarget = null;  // state string when pointer is over nav bar, else null
let _kbNavSortable   = null;  // Sortable instance on #kb-nav-cols (nav drop zone)
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
        onSave:         () => kbReload(),
        onCancel:       () => {},
    });

    // clientOnly = text/project/tags/priority → only unassigned needs re-render
    // !clientOnly = status/context changed   → full server re-fetch
    document.addEventListener('tw-filter-change', e => {
        if (e.detail && e.detail.clientOnly) kbRerenderUnassigned();
        else kbReload();
    });

    kbReload();
});

// ── Data ──────────────────────────────────────────────────────────────────────
async function kbReload(preserveView = false) {
    const savedOffset = kbColOffset;
    const savedFocus  = kbFocusedColIdx;
    try {
        const navState    = window.twNav ? window.twNav.getState() : {};
        const context     = (navState.context || '').trim();
        const statusParam = 'status=' + encodeURIComponent((navState.statuses || ['pending']).join(','));
        // Swimlanes: pending + context only (C); Unassigned: nav status + no context (FS via kbNavFilter)
        const swimParams  = 'status=pending' + (context ? '&context=' + encodeURIComponent(context) : '');
        const [colsData, swimData, unassignData, orderData] = await Promise.all([
            fetch('/api/kanban/columns').then(r => r.json()),
            fetch('/api/tasks?' + swimParams).then(r => r.json()),
            fetch('/api/tasks?' + statusParam).then(r => r.json()),
            fetch('/api/kanban/order').then(r => r.json()),
        ]);
        kbColumns       = colsData.columns    || [];
        kbAllTasks      = swimData.tasks      || [];
        kbUnassignedSrc = unassignData.tasks  || [];
        kbManualOrder   = orderData.order     || {};
        kbColOffset     = preserveView ? savedOffset : 0;
        // Unassigned (idx 0) never holds focus — default to first workflow column
        kbFocusedColIdx = preserveView ? savedFocus : (kbColumns.length > 0 ? 1 : 0);
        kbRenderBoard();
    } catch (e) {
        console.error('Kanban load failed:', e);
        document.dispatchEvent(new CustomEvent('tw-show-notification',
            { detail: { message: 'Failed to load kanban', type: 'error' } }));
    }
}

// ── Unassigned-only filter ────────────────────────────────────────────────────
// Mirrors main.js _matchAttr/_matchTags — applied to Unassigned column only.
// State columns show all tasks for that state within the active context.
const _KP = ['1','2','3','4','5','6','H','M','L'];
function _kbMod(input) {
    const m = input.match(/^\.([a-z]+):(.*)/i);
    if (m) return { mod: m[1].toLowerCase(), val: m[2] };
    const c = input.match(/^([<>])\s+(.*)/);
    if (c) return { mod: c[1] === '<' ? 'lt' : 'gt', val: c[2] };
    return null;
}
function _kbMatchAttr(fv, input, type) {
    const p = _kbMod(input), fvs = String(fv);
    if (!p) return type === 'ord'
        ? fvs.toLowerCase() === input.toLowerCase()
        : fvs.toLowerCase().includes(input.toLowerCase());
    const { mod, val } = p, fvl = fvs.toLowerCase(), vl = val.toLowerCase();
    if (mod === 'lt' || mod === 'gt') {
        const ai = _KP.indexOf(fvs.toUpperCase()), bi = _KP.indexOf(val.toUpperCase());
        if (ai === -1 || bi === -1) { const an = parseFloat(fvs), bn = parseFloat(val); return !isNaN(an) && !isNaN(bn) && (mod === 'lt' ? an < bn : an > bn); }
        return mod === 'lt' ? ai < bi : ai > bi;
    }
    switch (mod) {
        case 'any': return fvs !== ''; case 'none': return fvs === '';
        case 'is': return fvl === vl; case 'isnt': case 'not': return fvl !== vl;
        case 'contains': return fvl.includes(vl); case 'startswith': return fvl.startsWith(vl);
        case 'endswith': return fvl.endsWith(vl); default: return false;
    }
}
function _kbMatchTags(taskTags, input) {
    const p = _kbMod(input);
    if (!p) { const w = input.split(',').map(t => t.trim()).filter(Boolean); return !w.length || w.every(t => taskTags.includes(t)); }
    switch (p.mod) {
        case 'has': return taskTags.includes(p.val); case 'hasnt': return !taskTags.includes(p.val);
        case 'any': return taskTags.length > 0;      case 'none': return taskTags.length === 0;
        default: return false;
    }
}
function kbNavFilter(tasks) {
    if (!window.twNav) return tasks;
    const s = window.twNav.getState();
    const f = (s.filter || '').trim(), pr = (s.priority || '').trim(),
          pj = (s.project || '').trim(), tg = (s.tags || '').trim();
    return tasks.filter(t => {
        if (f  && !_kbMatchAttr(t.description || '', f,  'text')) return false;
        if (pr && !_kbMatchAttr(t.priority    || '', pr, 'ord'))  return false;
        if (pj && !_kbMatchAttr(t.project     || '', pj, 'text')) return false;
        if (tg && !_kbMatchTags(t.tags        || [], tg))         return false;
        return true;
    });
}

// ── Sort / view persistence ───────────────────────────────────────────────────
function kbGetSort(col) { return localStorage.getItem(`tw-kb-sort-${col}`) || 'urgency'; }
function kbSetSort(col, key) { localStorage.setItem(`tw-kb-sort-${col}`, key); }
function kbGetView(col) { return localStorage.getItem(`tw-kb-view-${col}`) || 'card'; }
function kbSetView(col, mode) { localStorage.setItem(`tw-kb-view-${col}`, mode); }

function kbSort(tasks, col) {
    const key = kbGetSort(col);
    if (key === 'manual') {
        const ord = kbManualOrder[col] || [];
        return [...tasks].sort((a, b) => {
            const ai = ord.indexOf(a.uuid), bi = ord.indexOf(b.uuid);
            if (ai === -1 && bi === -1) return 0;
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
        });
    }
    return [...tasks].sort((a, b) => {
        switch (key) {
            case 'urgency':  return (b.urgency || 0) - (a.urgency || 0);
            case 'due':      return !a.due ? 1 : !b.due ? -1 : a.due < b.due ? -1 : 1;
            case 'priority': return KB_PRI_ORDER.indexOf(a.priority || '') - KB_PRI_ORDER.indexOf(b.priority || '');
            case 'project':  return (a.project || '').localeCompare(b.project || '');
            case 'desc':     return (a.description || '').localeCompare(b.description || '');
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

    const assigned = new Set(kbColumns);
    board.appendChild(_kbMakeCol('', 'Unassigned',
        kbNavFilter(kbUnassignedSrc.filter(t => !assigned.has(t.state || ''))), true, -1));
    kbColumns.forEach((col, i) =>
        board.appendChild(_kbMakeCol(col, col,
            kbAllTasks.filter(t => (t.state || '') === col), false, i)));

    _kbInitResize();
    _kbUpdateNavPills();
    _kbApplyFocus();
}

function kbRerenderUnassigned() {
    const board    = document.getElementById('kb-board');
    const assigned = new Set(kbColumns);
    const existing = board.querySelector('.kb-col[data-col=""]');
    const fresh    = _kbMakeCol('', 'Unassigned',
        kbNavFilter(kbUnassignedSrc.filter(t => !assigned.has(t.state || ''))), true, -1);
    if (existing) board.replaceChild(fresh, existing); else board.prepend(fresh);
    _kbApplyVisibility();
    _kbApplyFocus();
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
        `<span class="kb-col-count">${tasks.length}</span>` +
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
        sorted.forEach(t => {
            const card = kbCardManager.createTaskCard(t);
            const tog  = document.createElement('span');
            tog.className = 'card-toggle';
            card.appendChild(tog);
            body.appendChild(card);
        });
    } else {
        body.innerHTML = `<div class="kb-empty">${isUnassigned ? 'No unassigned tasks' : 'Empty'}</div>`;
    }
    div.appendChild(body);

    new Sortable(body, {
        group:       'kanban',
        animation:   150,
        ghostClass:  'sortable-ghost',
        chosenClass: 'sortable-chosen',
        filter:      '.card-toggle',
        onStart(evt) { _kbDragStart(evt.item.dataset.taskId); },
        onEnd(evt) {
            _kbDragEnd();  // cleanup move listeners, nav styling
            // Nav drops are handled by _kbNavSortable onAdd — skip here to avoid double-write
            if (evt.to.id === 'kb-nav-cols') return;
            if (evt.from !== evt.to) {
                // dropped in a different column — write state then reload to sync local arrays
                _kbSetState(evt.item.dataset.taskId, evt.to.dataset.col).then(() => kbReload(true));
            } else if (evt.oldIndex !== evt.newIndex) {
                // within-column reorder — save manual order, no task mutation
                const c     = evt.to.dataset.col;
                const uuids = [...evt.to.querySelectorAll('[data-task-id]')]
                    .map(el => el.dataset.taskId);
                kbManualOrder[c] = uuids;
                kbSetSort(c, 'manual');
                _kbSaveOrder(c, uuids);
                // reflect 'manual' in the sort popup without a full re-render
                document.querySelector(`.kb-sort-popup[data-kb-popup="${c}"]`)
                    ?.querySelectorAll('input[type="radio"]')
                    .forEach(r => { r.checked = r.value === 'manual'; });
            }
        },
    });

    return div;
}

// ── Column focus ──────────────────────────────────────────────────────────────
function _kbSetFocus(idx) {
    // Unassigned (idx 0) never receives focus — bring it into view but keep current focus
    if (idx === 0 && kbColumns.length > 0) { _kbBringIntoView(0); return; }
    const board = document.getElementById('kb-board');
    const cols  = [...board.querySelectorAll('.kb-col')];
    kbFocusedColIdx = Math.max(1, Math.min(idx, cols.length - 1));
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
    [...board.querySelectorAll('.kb-col')].forEach((c, i) =>
        c.classList.toggle('kb-col--focused', i === kbFocusedColIdx));
    _kbUpdateNavPillState();
}

// ── Column visibility (ResizeObserver) ────────────────────────────────────────
function _kbInitResize() {
    const board = document.getElementById('kb-board');
    if (_kbResizeObs) _kbResizeObs.disconnect();
    _kbResizeObs = new ResizeObserver(() => _kbApplyVisibility());
    _kbResizeObs.observe(board);
    _kbApplyVisibility();
}

function _kbMaxVisible() {
    const board = document.getElementById('kb-board');
    const w     = board.clientWidth - 24; // subtract padding (2×12px)
    return Math.max(1, Math.floor((w + KB_COL_GAP) / (KB_MIN_COL_W + KB_COL_GAP)));
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
    _kbNavDropTarget = null;
    // kb-dragging is NOT set here — the move handler adds/removes it as the
    // pointer enters/leaves the nav so the stack only appears on demand.

    const nav = document.getElementById('kb-col-nav');
    let panTimer = null;

    const handler = e => {
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
        group: { name: 'kanban', put: () => navEl.classList.contains('kb-dragging'), pull: false },
        animation:  0,
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
                _kbSetState(uuid, targetState).then(() => kbReload(true));
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

    // Per-card expand/collapse toggle
    const tog = e.target.closest('.card-toggle');
    if (tog) {
        const card     = tog.closest('.task-card');
        const listView = tog.closest('.kb-col-body')?.classList.contains('list-view');
        if (listView) card.classList.toggle('card--expanded');
        else          card.classList.toggle('card--collapsed');
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
    const body     = colDiv.querySelector('.kb-col-body');
    const assigned = new Set(kbColumns);
    const src      = col === ''
        ? kbNavFilter(kbUnassignedSrc.filter(t => !assigned.has(t.state || '')))
        : kbAllTasks.filter(t => (t.state || '') === col);
    body.innerHTML = '';
    kbSort(src, col).forEach(t => {
        const card = kbCardManager.createTaskCard(t);
        const tog  = document.createElement('span');
        tog.className = 'card-toggle';
        card.appendChild(tog);
        body.appendChild(card);
    });
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
// Drag/drop (column body and nav pill) only modifies state — nothing else.
// All other task mutations go through kbCardManager CRUD actions.

async function _kbSaveOrder(col, uuids) {
    try {
        await fetch('/api/kanban/order', {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ col, order: uuids }),
        });
    } catch {
        document.dispatchEvent(new CustomEvent('tw-show-notification',
            { detail: { message: 'Failed to save sort order', type: 'error' } }));
    }
}

async function _kbSetState(uuid, newState) {
    try {
        const r = await fetch(`/api/task/${uuid}/modify`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ state: newState }),
        });
        const d = await r.json();
        if (!d.success) document.dispatchEvent(new CustomEvent('tw-show-notification',
            { detail: { message: `Error: ${d.error || d.message}`, type: 'error' } }));
    } catch {
        document.dispatchEvent(new CustomEvent('tw-show-notification',
            { detail: { message: 'Network error updating state', type: 'error' } }));
    }
}
