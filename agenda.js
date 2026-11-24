'use strict';

let taskCardManager;
let taskEditor;
let _renderId = 0;        // a newer render makes an older one's late layers draw nothing
let _agendaCfg = null;    // /api/config, once per page: cal_holidays, agenda_holiday_days

document.addEventListener('DOMContentLoaded', () => {
    taskEditor = new TaskEditor({
        showAllFields: true,
        priorityFormat: 'letters',
        language: 'en',
        modalId: 'unified-task-editor',
        onSaveSuccess: () => loadAgenda(),
        onLogSuccess:  () => showNotification('Task logged', 'success'),
        onSaveError:   (err) => showNotification(err, 'error'),
        onCancel:      () => {}
    });

    taskCardManager = new TaskCardManager(new AgendaActionHandler());

    // Card / list view toggle — shared localStorage key with main list
    const cardBtn   = document.getElementById('view-card');
    const listBtn   = document.getElementById('view-list');
    const container = document.getElementById('tasks-container');
    const setView = (mode) => {
        localStorage.setItem('tw-view-mode', mode);
        cardBtn.classList.toggle('active', mode === 'card');
        listBtn.classList.toggle('active', mode === 'list');
        container.classList.toggle('list-view', mode === 'list');
    };
    setView(localStorage.getItem('tw-view-mode') || 'card');
    cardBtn.addEventListener('click', () => setView('card'));
    listBtn.addEventListener('click', () => setView('list'));

    // Expand/collapse on card click
    container.addEventListener('click', (e) => {
        if (e.target.closest('[data-task-action]')) return;
        const card = e.target.closest('.task-card');
        if (!card) return;
        const mode = localStorage.getItem('tw-view-mode') || 'card';
        if (mode === 'list') card.classList.toggle('expanded');
        else card.classList.toggle('collapsed');
    });


    window.twNav?.initProjectsSidebar(document.getElementById('tw-proj-sidebar'));
    window.twNav?.initTagsSidebar(document.getElementById('tw-tags-sidebar'));
    loadAgenda();
    document.addEventListener('tw-open-add',      () => { if (taskEditor) taskEditor.show(null); });
    document.addEventListener('tw-filter-change', loadAgenda);
});

// ── Task cache (TW.store 'dated': /api/tasks/dated for these params) ──────────
function _readDated(cacheKey) {
    const x = TW.store.read('dated', x => x.cacheKey === cacheKey);
    return x && x.tasks;
}

function _writeDated(cacheKey, tasks) {
    TW.store.save('dated', { cacheKey, tasks });
}

// ── Data loading ──────────────────────────────────────────────────────────────

function loadAgenda() {
    const params = window.twNav ? window.twNav.stateToParams() : 'status=pending';

    document.getElementById('loading').style.display = '';
    document.getElementById('error-message').style.display = 'none';
    document.getElementById('tasks-container').innerHTML = '';

    const cached = _readDated(params);
    if (cached) {
        document.getElementById('loading').style.display = 'none';
        renderAgenda(cached);
        return;
    }

    // Every task with scheduled, due, wait or until (waiting ones too, under Pending); each is
    // placed once, at its effective date (TW.edate; tw:docs/tw-web-edate-plan.md)
    fetch('api/tasks/dated?' + params).then(r => r.json())
    .then(data => {
        document.getElementById('loading').style.display = 'none';
        if (!data.success) throw new Error(data.error || 'failed');
        _writeDated(params, data.data || []);
        renderAgenda(data.data || []);
    })
    .catch(err => {
        document.getElementById('loading').style.display = 'none';
        const el = document.getElementById('error-message');
        el.textContent = 'Failed to load agenda: ' + err.message;
        el.style.display = '';
    });
}

// ── Rendering ─────────────────────────────────────────────────────────────────

const KIND_LABEL = { scheduled: 'Sched', due: 'Due', wait: 'Wait', until: 'Until' };

function renderAgenda(tasks) {
    const container = document.getElementById('tasks-container');
    const navState  = window.twNav ? window.twNav.getState() : {};

    // Completed/deleted: reverse-chrono by end date so most recent appears first
    const statuses  = navState.statuses || ['pending'];
    const isHistory = statuses.some(s => s === 'completed' || s === 'deleted');

    // Each task once, at its effective date: the earlier of scheduled and due, else wait, else until
    const items = tasks.map(t => {
        const e = TW.edate(t);
        return e && { ...t, _at: e.at, _type: e.field,
                      _sort: isHistory ? (t.end || t.modified || '') : e.at.toISOString() };
    }).filter(Boolean).sort((a, b) => {
        const cmp = String(a._sort).localeCompare(String(b._sort));
        return isHistory ? -cmp : cmp;
    });

    // Heading: raw counts by kind, before filtering ("3 Due, 5 Sched, 1 Wait"); the rare kinds only when there
    const heading = document.getElementById('tasks-heading');
    if (heading) {
        const n = k => items.filter(t => t._type === k).length;
        heading.textContent = ['due', 'scheduled', 'wait', 'until']
            .filter(k => k === 'due' || k === 'scheduled' || n(k))
            .map(k => `${n(k)} ${KIND_LABEL[k]}`).join(', ');
    }

    const total = items.length;
    const p     = window.twNav?.stateToParams() ?? '';
    let grandTotal = window.twNav?.getGrandTotal(p) ?? null;

    // Client-side filtering: the List's rules (TW.filter)
    const filtered = TW.filter.navTasks(items);

    window.twNav?.setCount(filtered.length, grandTotal ?? total);
    window._twAllTasks = items;  // seed dep lookup for agenda cards
    document.dispatchEvent(new CustomEvent('tw-tasks-loaded', { detail: { tasks: filtered } }));

    // If grand total isn't cached yet, fetch it in the background and update the counter
    if (grandTotal === null && window.twNav) {
        fetch('api/tasks?' + p).then(r => r.json()).then(data => {
            if (data.success && Array.isArray(data.tasks)) {
                grandTotal = data.tasks.length;
                window.twNav.setGrandTotal(grandTotal, p);
                window.twNav.setCount(filtered.length, grandTotal);
            }
        }).catch(() => {});
    }

    // Group by local calendar day (task's dates are UTC: 20:00 EDT is already tomorrow there)
    const groups = new Map();
    filtered.forEach(task => {
        const key = dayKey(task._at);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(task);
    });

    // Layers (TW.layers: holidays) put their names on the date lines; a layer that makes bars
    // (holidays) adds a line for a day with no tasks, from today to the later of the last task
    // shown and agenda_holiday_days ahead. History views only annotate the lines they have.
    const todayKey = dayKey(new Date());
    const myRender = ++_renderId;
    const draw = layers => {
        if (myRender === _renderId) drawAgenda(container, groups, layers, todayKey, isHistory, filtered.length, total);
    };
    agendaLayerDays([...groups.keys()].filter(k => k !== 'none'), todayKey, isHistory)
        .then(draw, err => { console.warn('[agenda] layers:', err); draw({ byDay: new Map(), bars: new Set() }); });
}

// {byDay: Map day → layer items, bars: Set of days that get a line without tasks}
async function agendaLayerDays(taskKeys, todayKey, isHistory) {
    const none = { byDay: new Map(), bars: new Set() };
    if (!TW.layers) return none;
    _agendaCfg = _agendaCfg || fetch('api/config').then(r => r.json()).catch(() => ({}));
    const cfg = await _agendaCfg;
    if (!TW.layers.enabled(cfg).length) return none;
    const sorted = [...taskKeys].sort();
    const ahead  = TW.layers.addDays(todayKey, Math.max(0, cfg.agenda_holiday_days ?? 30));
    const from   = sorted[0] && sorted[0] < todayKey ? sorted[0] : todayKey;
    const last   = sorted[sorted.length - 1];
    const to     = isHistory ? (last || todayKey) : (last && last > ahead ? last : ahead);
    const byDay  = TW.layers.byDay(await TW.layers.fetch(isHistory ? (sorted[0] || todayKey) : from, to, cfg));
    const bars   = new Set();
    if (!isHistory) {
        for (const [day, items] of byDay) {
            if (day >= todayKey && items.some(it => TW.layers.get(it.layer)?.makesBars)) bars.add(day);
        }
    }
    return { byDay, bars };
}

function drawAgenda(container, groups, layers, todayKey, isHistory, shown, total) {
    // There's always a TODAY bar, in date order, except in the history views (past dates,
    // newest first). With nothing shown for today it says so.
    let   todayDone = isHistory;
    const addToday = () => {
        container.appendChild(dateHeader(todayKey, isHistory, layers.byDay.get(todayKey)));
        const nothing = document.createElement('div');
        nothing.className = 'agenda-nothing';
        nothing.textContent = 'Nothing due or scheduled';
        container.appendChild(nothing);
        todayDone = true;
    };

    // The task days in their order, with the layer-only days merged in by date (not in history)
    let keys = [...groups.keys()];
    if (!isHistory && layers.bars.size) {
        const extra = [...layers.bars].filter(k => !groups.has(k));
        keys = [...keys.filter(k => k === 'none'), ...[...keys.filter(k => k !== 'none'), ...extra].sort()];
    }

    container.innerHTML = '';
    const allLookup = new Map((window._twAllTasks || []).map(t => [t.uuid, t]));
    keys.forEach(key => {
        if (!todayDone && key !== 'none' && key > todayKey) addToday();
        const tasks = groups.get(key);
        if (!tasks) {                                   // a holiday with no tasks
            if (key === todayKey) { addToday(); return; }
            container.appendChild(dateHeader(key, isHistory, layers.byDay.get(key)));
            return;
        }
        if (key === todayKey) todayDone = true;
        container.appendChild(dateHeader(key, isHistory, layers.byDay.get(key), tasks));
        tasks.forEach(task => {
            taskCardManager.appendWithDeps(container, task, allLookup);
            if (task._type === 'wait' || task._type === 'until') markKind(container, task);
        });
    });
    if (!todayDone) addToday();

    if (shown === 0 && (isHistory || total > 0)) {
        container.insertAdjacentHTML('beforeend', total === 0
            ? '<div class="empty-state"><p>No scheduled or due tasks.</p></div>'
            : '<div class="empty-state"><p>No tasks match the current filter.</p></div>');
    }
}

// YYYYMMDD of a local date (a task's dates are UTC: 20:00 EDT is already tomorrow there)
function dayKey(d) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// A task placed by its wait or until date says so on its card: neither shows there otherwise
function markKind(container, task) {
    const card = container.querySelector(`.task-card[data-task-id="${CSS.escape(task.uuid)}"]:not(.task-card-dep)`);
    if (!card) return;
    let meta = card.querySelector('.card-meta');
    if (!meta) {
        meta = document.createElement('div');
        meta.className = 'card-meta';
        card.querySelector('.card-desc')?.after(meta);
    }
    const chip = document.createElement('span');
    chip.className = `card-edate card-edate-${task._type}`;
    const day = task._at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    chip.textContent = task._type === 'wait' ? `wait ${day}` : `⌛ until ${day}`;
    chip.title = task._type === 'wait' ? 'Hidden from the List until then' : 'Deleted by Taskwarrior after then';
    meta.prepend(chip);
}

// A date line: centred and quiet; only "(overdue)" is red; a holiday's name follows the date, and
// so do the moon's phases and the seasons, with their icon and time.
// A click opens that day in the Calendar.
// "(overdue)" only for a past day that holds a past due date (a past scheduled, wait or until day
// is just a past day; djp 2026-11-23)
function dateHeader(key, isHistory, layerItems, tasks = []) {
    const { label, overdue: past, today } = formatDateKey(key, isHistory);
    const overdue = past && tasks.some(t => t._type === 'due');
    const header = document.createElement('div');
    header.className = 'agenda-date-header';
    header.textContent = label;
    for (const it of layerItems || []) {
        const name = document.createElement('span');
        name.className = `agenda-layer agenda-layer-${it.layer}`;
        name.textContent = ` · ${it.icon ? it.icon + ' ' : ''}${it.title}${it.time ? ' ' + it.time : ''}`;
        if (it.detail) name.title = it.detail;
        header.appendChild(name);
    }
    if (overdue) {
        const mark = document.createElement('span');
        mark.className = 'agenda-overdue';
        mark.textContent = '(overdue)';
        header.append(' ', mark);
        header.classList.add('overdue');
    }
    if (today) header.classList.add('today');
    if (key !== 'none') {
        header.style.cursor = 'pointer';
        header.title = 'Open in Calendar Day view';
        header.addEventListener('click', () => {
            window.location.href = `calendar-planner.html?date=${key}&view=day`;
        });
    }
    return header;
}

function formatDateKey(key, isHistory = false) {
    if (key === 'none') return { label: 'No date', overdue: false, today: false };
    const m = key.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) return { label: key, overdue: false, today: false };

    // Parse as local date — avoids UTC midnight shifting dates in UTC- timezones
    const taskDate = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    const now      = new Date(); now.setHours(0, 0, 0, 0);
    const diff     = taskDate - now;

    const DAY_NAMES   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const weekday  = DAY_NAMES[taskDate.getDay()];
    let   monthDay = `${MONTH_NAMES[taskDate.getMonth()]} ${taskDate.getDate()}`;
    if (taskDate.getFullYear() !== now.getFullYear()) monthDay += ` ${taskDate.getFullYear()}`;

    const datePart = `${weekday} - ${monthDay}`;

    if (diff < 0)          return isHistory
                               ? { label: datePart,                       overdue: false, today: false }
                               : { label: datePart,                       overdue: true,  today: false };
    if (diff === 0)        return { label: `TODAY - ${datePart}`,      overdue: false, today: true  };
    if (diff === 86400000) return { label: `TOMORROW - ${datePart}`,   overdue: false, today: false };

    return { label: datePart, overdue: false, today: false };
}

// ── Action handler ────────────────────────────────────────────────────────────

class AgendaActionHandler extends TaskActionHandler {
    constructor() {
        // The write already emptied the shared cache (TW.api.write), so this refetches
        super({
            onTaskUpdate: () => loadAgenda(),
            onTaskDelete: () => loadAgenda(),
            showNotification,
        });
    }
}

// ── Notifications ─────────────────────────────────────────────────────────────

function showNotification(message, type = 'info') {
    document.dispatchEvent(new CustomEvent('tw-show-notification',
        { detail: { message, type } }));
}
