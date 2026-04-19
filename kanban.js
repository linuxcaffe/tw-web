'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const KB_SORT_OPTIONS = [
    { key: 'urgency',  label: 'Urgency' },
    { key: 'due',      label: 'Due date' },
    { key: 'priority', label: 'Priority' },
    { key: 'project',  label: 'Project' },
    { key: 'desc',     label: 'Description' },
];
const KB_PRI_ORDER = ['1','2','3','4','5','6','H','M','L',''];

// ── Globals ───────────────────────────────────────────────────────────────────
let kbColumns  = [];
let kbAllTasks = [];
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
async function kbReload() {
    try {
        const params = window.twNav ? window.twNav.stateToParams() : 'status=pending';
        const [colsRes, tasksRes] = await Promise.all([
            fetch('/api/kanban/columns'),
            fetch('/api/tasks?' + params),
        ]);
        kbColumns  = (await colsRes.json()).columns  || [];
        kbAllTasks = (await tasksRes.json()).tasks   || [];
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

// ── Rendering ─────────────────────────────────────────────────────────────────
function kbRenderBoard() {
    const board    = document.getElementById('kb-board');
    const assigned = new Set(kbColumns);
    board.innerHTML = '';
    board.appendChild(_kbMakeCol('', 'Unassigned',
        kbNavFilter(kbAllTasks.filter(t => !assigned.has(t.state || ''))), true));
    kbColumns.forEach(col =>
        board.appendChild(_kbMakeCol(col, col,
            kbAllTasks.filter(t => (t.state || '') === col), false)));
    _kbUpdateColNav();
}

function kbRerenderUnassigned() {
    const board    = document.getElementById('kb-board');
    const assigned = new Set(kbColumns);
    const existing = board.querySelector('.kb-col[data-col=""]');
    const fresh    = _kbMakeCol('', 'Unassigned',
        kbNavFilter(kbAllTasks.filter(t => !assigned.has(t.state || ''))), true);
    if (existing) board.replaceChild(fresh, existing); else board.prepend(fresh);
    _kbUpdateColNav();
}

// colKey: localStorage key needs something for the empty-string unassigned col
function _kbColKey(col) { return col === '' ? '__unassigned__' : col; }

function _kbMakeCol(col, label, tasks, isUnassigned) {
    const view   = kbGetView(col);
    const sorted = kbSort(tasks, col);
    const colKey = _kbColKey(col);

    const div = document.createElement('div');
    div.className = 'kb-col';
    div.dataset.col = col;

    // header
    const hdr = document.createElement('div');
    hdr.className = 'kb-col-hdr' + (isUnassigned ? ' kb-col-hdr--unassigned' : '');
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
        sorted.forEach(t => body.appendChild(kbCardManager.createTaskCard(t)));
    } else {
        body.innerHTML = `<div class="kb-empty">${isUnassigned ? 'No unassigned tasks' : 'Empty'}</div>`;
    }
    div.appendChild(body);

    new Sortable(body, {
        group:       'kanban',
        animation:   150,
        ghostClass:  'sortable-ghost',
        chosenClass: 'sortable-chosen',
        onEnd(evt) {
            const uuid     = evt.item.dataset.taskId;
            const newState = evt.to.dataset.col;
            _kbSetState(uuid, newState);
        },
    });

    return div;
}

// ── Column nav ────────────────────────────────────────────────────────────────
let _kbObserver = null;

function _kbUpdateColNav() {
    const board = document.getElementById('kb-board');
    const nav   = document.getElementById('kb-col-nav');
    const pills = document.getElementById('kb-nav-cols');
    const prev  = document.getElementById('kb-nav-prev');
    const next  = document.getElementById('kb-nav-next');
    const cols  = [...board.querySelectorAll('.kb-col')];

    if (_kbObserver) _kbObserver.disconnect();

    pills.innerHTML = cols.map((c, i) =>
        `<button class="kb-nav-pill" data-kb-idx="${i}">${c.dataset.col || 'Unassigned'}</button>`
    ).join('');
    const pillEls = [...pills.querySelectorAll('.kb-nav-pill')];

    _kbObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const i = cols.indexOf(entry.target);
            if (i >= 0) pillEls[i]?.classList.toggle('active', entry.isIntersecting);
        });
        prev.disabled = !!(pillEls[0]?.classList.contains('active'));
        next.disabled = !!(pillEls[pillEls.length - 1]?.classList.contains('active'));
    }, { root: board, threshold: 0.5 });

    cols.forEach(c => _kbObserver.observe(c));

    pills.onclick = e => {
        const btn = e.target.closest('[data-kb-idx]');
        if (btn) cols[+btn.dataset.kbIdx]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    };
    prev.onclick = () => {
        const i = pillEls.findIndex(p => p.classList.contains('active'));
        if (i > 0) cols[i - 1].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    };
    next.onclick = () => {
        const i = pillEls.map(p => p.classList.contains('active')).lastIndexOf(true);
        if (i >= 0 && i < cols.length - 1) cols[i + 1].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    };
}

// ── UI event delegation ───────────────────────────────────────────────────────
document.addEventListener('click', e => {
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
        ? kbNavFilter(kbAllTasks.filter(t => !assigned.has(t.state || '')))
        : kbAllTasks.filter(t => (t.state || '') === col);
    body.innerHTML = '';
    kbSort(src, col).forEach(t => body.appendChild(kbCardManager.createTaskCard(t)));
});

// ── API ───────────────────────────────────────────────────────────────────────
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
