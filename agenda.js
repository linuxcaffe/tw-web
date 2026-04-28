'use strict';

let taskCardManager;
let taskEditor;

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

// ── Task cache (shared with calendar-planner.js via tw-cal-extras) ────────────
const _EXTRAS_KEY = 'tw-cal-extras';
const _DIRTY_KEY  = 'tw-tasks-dirty';
const _CACHE_TTL  = 30_000;

function _readExtras(cacheKey) {
    try {
        if (sessionStorage.getItem(_DIRTY_KEY) === '1') return null;
        const x = JSON.parse(sessionStorage.getItem(_EXTRAS_KEY));
        if (!x || x.cacheKey !== cacheKey || (Date.now() - x.ts) > _CACHE_TTL) return null;
        return { planned: x.planned, due: x.due };
    } catch { return null; }
}

function _writeExtras(cacheKey, planned, due) {
    try {
        sessionStorage.setItem(_EXTRAS_KEY, JSON.stringify({ cacheKey, planned, due, ts: Date.now() }));
        sessionStorage.removeItem(_DIRTY_KEY);
    } catch {}
}

// ── Data loading ──────────────────────────────────────────────────────────────

function loadAgenda() {
    const params = window.twNav ? window.twNav.stateToParams() : 'status=pending';

    document.getElementById('loading').style.display = '';
    document.getElementById('error-message').style.display = 'none';
    document.getElementById('tasks-container').innerHTML = '';

    const cached = _readExtras(params);
    if (cached) {
        document.getElementById('loading').style.display = 'none';
        renderAgenda(cached.planned, cached.due);
        return;
    }

    Promise.all([
        fetch('/api/tasks/planned?' + params).then(r => r.json()),
        fetch('/api/tasks/due?'     + params).then(r => r.json()),
    ])
    .then(([plannedData, dueData]) => {
        document.getElementById('loading').style.display = 'none';
        const scheduled = plannedData.success ? (plannedData.data || []) : [];
        const due       = dueData.success      ? (dueData.data  || []) : [];
        _writeExtras(params, scheduled, due);
        renderAgenda(scheduled, due);
    })
    .catch(err => {
        document.getElementById('loading').style.display = 'none';
        const el = document.getElementById('error-message');
        el.textContent = 'Failed to load agenda: ' + err.message;
        el.style.display = '';
    });
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderAgenda(scheduled, due) {
    const container = document.getElementById('tasks-container');
    const navState  = window.twNav ? window.twNav.getState() : {};

    // Update heading with raw counts before filtering
    const heading = document.getElementById('tasks-heading');
    if (heading) heading.textContent = `${due.length} Due, ${scheduled.length} Sched`;

    // Completed/deleted: reverse-chrono by end date so most recent appears first
    const statuses  = navState.statuses || ['pending'];
    const isHistory = statuses.some(s => s === 'completed' || s === 'deleted');

    const items = [
        ...scheduled.map(t => ({ ...t, _date: t.scheduled, _type: 'scheduled',
                                  _sort: isHistory ? (t.end || t.modified || t.scheduled) : t.scheduled })),
        ...due.map(      t => ({ ...t, _date: t.due,       _type: 'due',
                                  _sort: isHistory ? (t.end || t.modified || t.due)       : t.due       })),
    ].sort((a, b) => {
        const cmp = (a._sort || '').localeCompare(b._sort || '');
        return isHistory ? -cmp : cmp;
    });

    const total = items.length;
    const p     = window.twNav?.stateToParams() ?? '';
    let grandTotal = window.twNav?.getGrandTotal(p) ?? null;

    // Client-side filtering (mirrors main.js / calendar-planner.js)
    const filter   = (navState.filter   || '').trim().toLowerCase();
    const priority = (navState.priority || '').trim().toLowerCase();
    const project  = (navState.project  || '').trim().toLowerCase();
    const tags     = (navState.tags     || '').split(',').map(t => t.trim()).filter(Boolean);

    const filtered = items.filter(task => {
        if (filter   && !(task.description || '').toLowerCase().includes(filter))      return false;
        if (priority && !String(task.priority || '').toLowerCase().includes(priority)) return false;
        if (project  && !(task.project      || '').toLowerCase().includes(project))    return false;
        if (tags.length && !tags.every(t => (task.tags || []).includes(t)))            return false;
        return true;
    });

    window.twNav?.setCount(filtered.length, grandTotal ?? total);
    window._twAllTasks = items;  // seed dep lookup for agenda cards
    document.dispatchEvent(new CustomEvent('tw-tasks-loaded', { detail: { tasks: filtered } }));

    // If grand total isn't cached yet, fetch it in the background and update the counter
    if (grandTotal === null && window.twNav) {
        fetch('/api/tasks?' + p).then(r => r.json()).then(data => {
            if (data.success && Array.isArray(data.tasks)) {
                grandTotal = data.tasks.length;
                window.twNav.setGrandTotal(grandTotal, p);
                window.twNav.setCount(filtered.length, grandTotal);
            }
        }).catch(() => {});
    }

    if (filtered.length === 0) {
        container.innerHTML = total === 0
            ? '<div class="empty-state"><p>No scheduled or due tasks.</p></div>'
            : '<div class="empty-state"><p>No tasks match the current filter.</p></div>';
        return;
    }

    // Group by calendar day
    const groups = new Map();
    filtered.forEach(task => {
        const key = (task._date || '').slice(0, 8) || 'none';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(task);
    });

    container.innerHTML = '';
    groups.forEach((tasks, key) => {
        const { label, overdue, today } = formatDateKey(key, isHistory);
        const header = document.createElement('div');
        header.className = 'agenda-date-header';
        header.textContent = label;
        if (overdue) header.classList.add('overdue');
        if (today)   header.classList.add('today');
        if (key !== 'none') {
            header.style.cursor = 'pointer';
            header.title = 'Open in Calendar Day view';
            header.addEventListener('click', () => {
                window.location.href = `/calendar-planner.html?date=${key}&view=day`;
            });
        }
        container.appendChild(header);

        const allLookup = new Map((window._twAllTasks || []).map(t => [t.uuid, t]));
        tasks.forEach(task => taskCardManager.appendWithDeps(container, task, allLookup));
    });
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
                               : { label: `${datePart} (overdue)`,        overdue: true,  today: false };
    if (diff === 0)        return { label: `TODAY - ${datePart}`,      overdue: false, today: true  };
    if (diff === 86400000) return { label: `TOMORROW - ${datePart}`,   overdue: false, today: false };

    return { label: datePart, overdue: false, today: false };
}

// ── Action handler ────────────────────────────────────────────────────────────

class AgendaActionHandler extends TaskActionHandler {
    constructor() {
        // Invalidate shared cache before reloading so calendar also refetches
        const invalidateAndReload = () => {
            sessionStorage.setItem(_DIRTY_KEY, '1');
            loadAgenda();
        };
        super({
            onTaskUpdate: invalidateAndReload,
            onTaskDelete: invalidateAndReload,
            showNotification,
        });
    }
}

// ── Notifications ─────────────────────────────────────────────────────────────

function showNotification(message, type = 'info') {
    document.dispatchEvent(new CustomEvent('tw-show-notification',
        { detail: { message, type } }));
}
