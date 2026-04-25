'use strict';

// ── Globals ───────────────────────────────────────────────────────────────────
let calendar;
let taskEditor;
let taskCardManager;
let unplannedTasks   = [];
let allTasks         = [];
let dueTasks         = [];
let _calEventSource  = null;  // managed FC event source — remove before re-adding
let _loadId          = 0;     // increment each loadTasks() call; cancelled calls are ignored
let _calSettings     = {};    // loaded from /api/config before calendar init

// ── Task cache ────────────────────────────────────────────────────────────────
// Two-layer cache:
//   'tw-tasks-cache'  — shared with main.js: {params, tasks, ts}
//   'tw-cal-extras'   — calendar-only:       {cacheKey, planned, due, ts}
// 'tw-tasks-dirty' is the shared invalidation flag written by all pages on any write.
const _SHARED_KEY  = 'tw-tasks-cache';
const _EXTRAS_KEY  = 'tw-cal-extras';
const _DIRTY_KEY   = 'tw-tasks-dirty';
const _CACHE_TTL   = 30_000; // ms

function _isDirty() { return sessionStorage.getItem(_DIRTY_KEY) === '1'; }

function _readCache(params, cacheKey) {
    try {
        if (_isDirty()) return null;
        const now = Date.now();
        const s = JSON.parse(sessionStorage.getItem(_SHARED_KEY));
        const x = JSON.parse(sessionStorage.getItem(_EXTRAS_KEY));
        if (!s || s.params !== params         || (now - s.ts) > _CACHE_TTL) return null;
        if (!x || x.cacheKey !== cacheKey     || (now - x.ts) > _CACHE_TTL) return null;
        return { allFetched: s.tasks, plannedTasks: x.planned, due: x.due };
    } catch { return null; }
}

function _writeCache(params, cacheKey, allFetched, plannedTasks, due) {
    try {
        const now = Date.now();
        sessionStorage.setItem(_SHARED_KEY, JSON.stringify({ params, tasks: allFetched, ts: now }));
        sessionStorage.setItem(_EXTRAS_KEY, JSON.stringify({ cacheKey, planned: plannedTasks, due, ts: now }));
        sessionStorage.removeItem(_DIRTY_KEY);
    } catch {}
}

function _applyLoaded(myId, allFetched, plannedTasks, due) {
    if (myId !== _loadId) return;
    dueTasks       = due;
    unplannedTasks = allFetched.filter(t => !t.scheduled && !t.due);
    allTasks       = [...unplannedTasks, ...plannedTasks];
    applyFiltersAndDisplay();
    processTasksForCalendar(plannedTasks);
}

// ── Priority helper ───────────────────────────────────────────────────────────
function calPriClass(pri) {
    if (!pri) return '';
    const n = parseInt(pri);
    if (!isNaN(n)) return n <= 2 ? 'high' : n <= 4 ? 'med' : 'low';
    if (pri === 'H') return 'high';
    if (pri === 'M') return 'med';
    if (pri === 'L') return 'low';
    return '';
}

// ── Debug helper (temporary) ──────────────────────────────────────────────────
function _dbg(msg) {
    console.error('[cal-debug]', msg);
    fetch('/api/debug', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg: String(msg) }) }).catch(() => {});
    const el = document.getElementById('cal-debug-banner');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
}
window.onerror = (msg, src, line, col, err) => {
    _dbg(`JS ERROR: ${msg} @ ${src}:${line}:${col}${err ? ' — ' + err.stack : ''}`);
};
// Unhandled promise rejections — log only, don't show banner (SSE/nav churn is benign)
window.onunhandledrejection = (e) => {
    const msg = e.reason?.message || String(e.reason);
    console.warn('[cal-debug] Unhandled promise:', msg);
    fetch('/api/debug', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg: 'Unhandled promise: ' + msg }) }).catch(() => {});
};

// ── DOMContentLoaded ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const _step = (name, fn) => { try { fn(); } catch(e) { _dbg(`CRASH in ${name}: ${e.message}\n${e.stack}`); throw e; } };

    // Load calendar settings before initialising the calendar
    try {
        const r = await fetch('/api/config');
        _calSettings = await r.json();
    } catch (_) { /* use defaults */ }

    _step('TaskCardManager', () => {
        taskCardManager = new TaskCardManager(new CalendarTaskActionHandler());
    });

    _step('TaskEditor', () => {
        taskEditor = new TaskEditor({
            showAllFields:  true,
            priorityFormat: 'letters',
            language:       'en',
            modalId:        'unified-task-editor',
            onSaveSuccess:  () => loadTasks(),
            onLogSuccess:   () => showCalNotification('Task logged', 'success'),
            onSaveError:    (err) => showCalNotification(err, 'error'),
            onCancel:       () => {}
        });
    });

    _step('initializeCalendar', () => initializeCalendar());
    _step('setupEventListeners', () => setupEventListeners());
    _step('initSidebarControls', () => initSidebarControls());
    _step('loadTasks', () => loadTasks());
    _step('setupCalTooltip', () => setupCalTooltip());

    document.addEventListener('tw-open-add',      () => { if (taskEditor) taskEditor.show(null); });
    document.addEventListener('tw-filter-change', () => loadTasks());
    document.addEventListener('tw-sync-complete', () => loadTasks());

    // Navigate to date/view from URL params (e.g. Agenda page date-header click)
    const params    = new URLSearchParams(location.search);
    const paramView = params.get('view');
    const paramDate = params.get('date');
    if (paramView) changeView(paramView);
    if (paramDate && /^\d{8}$/.test(paramDate)) {
        const y = +paramDate.slice(0, 4), mo = +paramDate.slice(4, 6) - 1, d = +paramDate.slice(6, 8);
        calendar.gotoDate(new Date(y, mo, d));
    }
});

// ── Calendar initialisation ───────────────────────────────────────────────────
function initializeCalendar() {
    const el = document.getElementById('calendar');

    calendar = new FullCalendar.Calendar(el, {
        initialView:          _calSettings.cal_default_view  || 'timeGridWeek',
        headerToolbar:        false,     // we render our own toolbar
        slotMinTime:          _calSettings.cal_day_start     || '06:00:00',
        slotMaxTime:          _calSettings.cal_day_end       || '23:00:00',
        firstDay:             1,         // Monday
        nowIndicator:         true,
        allDaySlot:           false,     // due events are timed; no allday strip needed
        editable:             true,      // drag + resize on scheduled events
        droppable:            true,      // accept external drags from sidebar
        eventMinHeight:       18,
        stickyHeaderDates:       true,      // day names stay visible while scrolling time grid
        eventResizableFromStart: true,      // resize from leading edge too
        dayMaxEvents:            true,      // month view: "+N more" instead of overflowing
        weekNumbers:             true,      // ISO week numbers in gutter (TW users love these)
        weekNumberFormat:        { week: 'narrow' },  // "W16" compact style
        slotDuration:            _calSettings.cal_slot_duration || '00:15:00',
        scrollTime:              _calSettings.cal_scroll_time || '08:00:00',
        scrollTimeReset:         false,      // don't jump back on week/day navigation
        selectable:              true,       // drag to select a time range
        selectMirror:            true,       // ghost event preview while selecting
        businessHours: {                     // subtle shading for Mon–Fri 9–5
            daysOfWeek: [1, 2, 3, 4, 5],
            startTime:  '09:00',
            endTime:    '17:00',
        },
        moreLinkClick: (info) => {           // "+N more" → day view with correct button state
            changeView('day');
            calendar.gotoDate(info.date);
            return 'stop';
        },

        eventTimeFormat: {
            hour:           'numeric',
            minute:         '2-digit',
            omitZeroMinute: true,
            meridiem:       'short'
        },

        // Custom event content: priority dot + description + project label
        eventContent: renderEventContent,

        // Callbacks
        eventClick:   (info) => showEventModal(info.event),
        eventDrop:    handleEventDrop,
        eventResize:  handleEventResize,
        eventReceive: handleEventReceive,
        select:       handleSelect,          // drag/click to create — replaces dateClick

        datesSet: () => updateCalendarTitle(),
    });

    calendar.render();
    setupExternalDrag();

    // Set explicit pixel height after flex layout settles, and on every resize.
    // Observe the COLUMN (parent), not #calendar itself — observing the mount point
    // creates a feedback loop: FC renders → #calendar size changes → observer fires
    // → setOption('height') → FC re-renders → interrupts event rendering.
    // After fitCalHeight triggers a re-render via setOption, scrollToTime ensures
    // the scroll position lands on the configured time (re-render can reset it).
    const col = document.querySelector('.calendar-column');
    requestAnimationFrame(() => {
        fitCalHeight();
        // Double RAF: let FC finish its setOption re-render before scrolling
        requestAnimationFrame(() => {
            calendar.scrollToTime(_calSettings.cal_scroll_time || '08:00:00');
            _updateSlotLabel();
        });
    });
    window.addEventListener('resize', fitCalHeight);
    if (col) new ResizeObserver(fitCalHeight).observe(col);
}

function fitCalHeight() {
    if (!calendar) return;
    if (window.innerWidth <= 768) {
        calendar.setOption('height', 'auto');
        return;
    }
    const col = document.querySelector('.calendar-column');
    const h   = col ? col.clientHeight : 0;
    if (h > 0) calendar.setOption('height', h);
}

// ── External drag: sidebar task cards → calendar ──────────────────────────────
function setupExternalDrag() {
    const container = document.getElementById('unplanned-tasks');
    if (!container || typeof FullCalendar?.Draggable === 'undefined') return;

    new FullCalendar.Draggable(container, {
        itemSelector: '.task-card',
        eventData(cardEl) {
            const task = JSON.parse(cardEl.dataset.taskData || '{}');
            const mins = parseEstTime(task.sched_duration) || 30;
            return {
                id:              task.uuid,
                title:           task.description || '',
                duration:        { hours: Math.floor(mins / 60), minutes: mins % 60 },
                backgroundColor: '#4a90e2',
                borderColor:     '#357abd',
                textColor:       '#fff',
                extendedProps:   { raw: task },
            };
        }
    });
}

// ── Click or drag empty slots → create new task ──────────────────────────────
// Replaces dateClick: handles both single-slot clicks and dragged ranges.
// When the user drags, sched_duration is pre-filled from the selection length.
function handleSelect(info) {
    if (!taskEditor) return;
    calendar.unselect();   // clear selection highlight before editor opens

    const d      = info.start;
    const pad    = n => String(n).padStart(2, '0');
    const localDT = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const mins   = Math.round((info.end - info.start) / 60000);

    taskEditor.show(null);   // open as new task (clears form)

    requestAnimationFrame(() => {
        const modal = document.getElementById('unified-task-editor');
        if (!modal) return;
        const schedField = modal.querySelector('#task-editor-scheduled');
        if (schedField) {
            schedField.value = localDT;
            schedField.dispatchEvent(new Event('change'));  // sync dim/bright state
        }
        // Pre-fill duration only when user dragged (> one 15-min slot)
        if (mins > 15) {
            const durField = modal.querySelector('#task-editor-sched-duration');
            if (durField) durField.value = minsToISO(mins);
        }
    });
}

// ── Event content renderer ────────────────────────────────────────────────────
function renderEventContent(arg) {
    const task = arg.event.extendedProps?.raw || {};
    const desc = arg.event.title;
    const pc   = calPriClass(task.priority);
    const view = calendar.view.type;

    const wrap = document.createElement('div');
    wrap.className  = 'fc-ev-wrap';
    wrap.dataset.desc = desc;

    const body = document.createElement('div');
    body.className = 'fc-ev-body';

    const title = document.createElement('span');
    title.className = 'fc-ev-title';

    // Priority dot inside the title, floated left — only indents the first line;
    // subsequent lines are clear of the float and flow edge-to-edge.
    if (pc) {
        const dot = document.createElement('span');
        dot.className = `fc-pri-dot fc-pri-${pc}`;
        title.appendChild(dot);
    }
    title.appendChild(document.createTextNode(desc));
    body.appendChild(title);

    // Project: only in day view where there's more room
    if (task.project && view === 'timeGridDay') {
        const proj = document.createElement('span');
        proj.className   = 'fc-ev-project';
        proj.textContent = task.project;
        body.appendChild(proj);
    }

    wrap.appendChild(body);

    return { domNodes: [wrap] };
}

// ── Optimistic event drop/resize ──────────────────────────────────────────────
function _isDueEvent(fcEvent) { return fcEvent.id.endsWith('_due'); }

async function handleEventDrop(info) {
    const task = info.event.extendedProps?.raw;
    if (!task?.uuid) return;

    const isDue   = _isDueEvent(info.event);
    const mins    = info.event.end ? Math.round((info.event.end - info.event.start) / 60000) : null;
    const modData = isDue
        ? { due: toLocalISOString(info.event.start), ...(mins ? { due_duration: minsToISO(mins) } : {}) }
        : { scheduled: toLocalISOString(info.event.start), ...(mins ? { sched_duration: minsToISO(mins) } : {}) };

    const result = await modifyTaskInBackend(task.uuid, modData);
    if (result.success) {
        const updated = { ...task, ...modData };
        info.event.setExtendedProp('raw', updated);
        const idx = allTasks.findIndex(t => t.uuid === task.uuid);
        if (idx !== -1) allTasks[idx] = updated;
        try { sessionStorage.setItem(_DIRTY_KEY, '1'); } catch {}
        showCalNotification('Task updated', 'info');
    } else {
        info.revert();
        showCalNotification('Failed to move task: ' + (result.error || ''), 'error');
    }
}

async function handleEventResize(info) {
    const task = info.event.extendedProps?.raw;
    if (!task?.uuid) return;

    const isDue   = _isDueEvent(info.event);
    const mins    = Math.round((info.event.end - info.event.start) / 60000);
    const modData = isDue
        ? { due: toLocalISOString(info.event.start), due_duration: minsToISO(mins) }
        : { scheduled: toLocalISOString(info.event.start), sched_duration: minsToISO(mins) };

    const result = await modifyTaskInBackend(task.uuid, modData);
    if (result.success) {
        const updated = { ...task, ...modData };
        info.event.setExtendedProp('raw', updated);
        const idx = allTasks.findIndex(t => t.uuid === task.uuid);
        if (idx !== -1) allTasks[idx] = updated;
        try { sessionStorage.setItem(_DIRTY_KEY, '1'); } catch {}
        showCalNotification('Task updated', 'info');
    } else {
        info.revert();
        showCalNotification('Failed to resize: ' + (result.error || ''), 'error');
    }
}

// External drag received from sidebar
async function handleEventReceive(info) {
    const task = info.event.extendedProps?.raw;
    if (!task?.uuid) { info.event.remove(); return; }

    const result = await modifyTaskInBackend(task.uuid, {
        scheduled: toLocalISOString(info.event.start)
    });
    if (!result.success) {
        info.event.remove();
        showCalNotification('Failed to schedule task: ' + (result.error || ''), 'error');
        return;
    }
    loadTasks();  // reload sidebar + calendar
}

function minsToISO(mins) {
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h > 0 && m > 0) return `PT${h}H${m}M`;
    if (h > 0)           return `PT${h}H`;
    return `PT${m}M`;
}

// ── Navigation ────────────────────────────────────────────────────────────────
function setupEventListeners() {
    document.getElementById('prev-btn').addEventListener('click',  () => { calendar.prev();  updateCalendarTitle(); });
    document.getElementById('next-btn').addEventListener('click',  () => { calendar.next();  updateCalendarTitle(); });
    document.getElementById('today-btn').addEventListener('click', () => { calendar.today(); updateCalendarTitle(); });

    document.querySelectorAll('.view-btn[data-view]').forEach(btn =>
        btn.addEventListener('click', (e) => changeView(e.currentTarget.dataset.view))
    );

    document.addEventListener('keydown', e => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
        if (e.target.closest('.modal, .task-editor-backdrop, [role="dialog"]')) return;
        if (e.key === 'T') { e.preventDefault(); calendar.today(); updateCalendarTitle(); }
        else if (e.key === 'ArrowLeft')  { e.preventDefault(); calendar.prev();  updateCalendarTitle(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); calendar.next();  updateCalendarTitle(); }
    });
}

const _SLOT_CYCLE = ['00:15:00', '00:30:00', '01:00:00'];
const _SLOT_LABEL = { '00:15:00': '15m', '00:30:00': '30m', '01:00:00': '60m' };

function _currentSlot() {
    return calendar.getOption('slotDuration') || _calSettings.cal_slot_duration || '00:15:00';
}

function _cycleSlot() {
    const cur = _currentSlot();
    // Normalise FC's returned value (may be an object or string like "00:15:00")
    const curStr = typeof cur === 'string' ? cur : `${String(cur.hours || 0).padStart(2,'0')}:${String(cur.minutes || 0).padStart(2,'0')}:00`;
    const idx = _SLOT_CYCLE.indexOf(curStr);
    return _SLOT_CYCLE[(idx + 1) % _SLOT_CYCLE.length];
}

function _updateSlotLabel() { /* labels removed — cycle is silent */ }

function changeView(view) {
    if (view === 'today') {
        calendar.today();
        return;
    }
    const fcViews   = { week: 'timeGridWeek', day: 'timeGridDay', month: 'dayGridMonth' };
    const currentFC = calendar.view.type;
    const isTimegrid = view === 'week' || view === 'day';

    // Repeated click on active timegrid view → cycle slot duration
    if (isTimegrid && currentFC === fcViews[view]) {
        const next = _cycleSlot();
        calendar.setOption('slotDuration', next);
        requestAnimationFrame(() => calendar.scrollToTime(_calSettings.cal_scroll_time || '08:00:00'));
    } else {
        if (fcViews[view]) calendar.changeView(fcViews[view]);
    }

    document.getElementById('calendar').dataset.view = view;
    document.querySelectorAll('.view-btn[data-view]').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.view === view)
    );
    _updateSlotLabel();
    updateCalendarTitle();
}

function updateCalendarTitle() {
    const titleEl = document.getElementById('calendar-title');
    if (titleEl) titleEl.textContent = calendar.view.title;

    const todayBtn = document.getElementById('today-btn');
    if (todayBtn) {
        const now = new Date();
        todayBtn.classList.toggle('active',
            calendar.view.currentStart <= now && now < calendar.view.currentEnd);
    }
}

// ── Data loading ──────────────────────────────────────────────────────────────
function loadTasks() {
    const myId        = ++_loadId;   // mark this wave; older in-flight calls become stale
    const navState    = window.twNav ? window.twNav.getState() : {};
    const context     = (navState.context || '').trim();
    // Drag-list: always pending, context-aware — blind to status bar
    const params      = 'status=pending' + (context ? '&context=' + encodeURIComponent(context) : '');
    // Calendar events: follow status bar (completed, deleted, waiting, recurring all visible)
    const calParams   = 'status=' + encodeURIComponent((navState.statuses || ['pending']).join(','));

    // Serve from cache when clean and fresh — skips all three fetches
    const cached = _readCache(params, calParams);
    if (cached) {
        _applyLoaded(myId, cached.allFetched, cached.plannedTasks, cached.due);
        return;
    }

    function _fetch(attempt) {
        Promise.all([
            fetch('/api/tasks?'         + params    ).then(r => r.json()),
            fetch('/api/tasks/planned?' + calParams ).then(r => r.json()),
            fetch('/api/tasks/due?'     + calParams ).then(r => r.json()),
        ])
        .then(([data, plannedData, dueData]) => {
            if (myId !== _loadId) return;   // superseded by a newer loadTasks() call
            if (!data.success) throw new Error(data.error || 'Failed to load tasks');

            const allFetched   = data.tasks || [];
            const plannedTasks = plannedData.success ? (plannedData.data || []) : [];
            const due          = dueData.success      ? (dueData.data  || []) : [];

            _writeCache(params, calParams, allFetched, plannedTasks, due);
            _applyLoaded(myId, allFetched, plannedTasks, due);
        })
        .catch(err => {
            if (myId !== _loadId) return;   // stale — a newer call is handling things
            // Retry up to 2× on transient WebKit body-read errors (SW race, stream drop)
            if (attempt < 2 && /object|network|fetch/i.test(err.message || '')) {
                const delay = attempt === 0 ? 1200 : 2500;
                setTimeout(() => { if (myId === _loadId) _fetch(attempt + 1); }, delay);
            } else {
                showCalNotification('Failed to load tasks: ' + err.message, 'error');
            }
        });
    }

    _fetch(0);
}

function processTasksForCalendar(scheduledTasks) {
    // Remove the previous event source cleanly (removeAllEvents() leaves stale
    // sources that FC may re-evaluate; tracking one source avoids this).
    if (_calEventSource) {
        try { _calEventSource.remove(); } catch (_) {}
        _calEventSource = null;
    }

    const events = [];
    scheduledTasks.forEach(task => {
        try { const e = createCalendarEvent(task); if (e) events.push(e); } catch (_) {}
    });
    dueTasks.forEach(task => {
        try { const e = createDueEvent(task); if (e) events.push(e); } catch (_) {}
    });

    _calEventSource = calendar.addEventSource(events);
}

// ── Event object factories ─────────────────────────────────────────────────────
function createCalendarEvent(task) {
    if (!task.scheduled) return null;
    // Keep Z — TW exports UTC; let JS parse as UTC so FullCalendar displays in local time
    const isoDate = task.scheduled.replace(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'
    );
    const start = new Date(isoDate);
    if (isNaN(start.getTime())) return null;

    let mins = 60;
    if (task.sched_duration?.startsWith('PT')) {
        const m = task.sched_duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
        if (m) mins = (parseInt(m[1] || 0) * 60 + parseInt(m[2] || 0)) || 60;
    }

    const ev = {
        id:              task.uuid,
        title:           task.description,
        start,
        end:             new Date(start.getTime() + mins * 60000),
        backgroundColor: '#4a90e2',
        borderColor:     '#357abd',
        textColor:       '#fff',
        editable:        true,
        extendedProps:   { raw: task },
    };
    if (task.status === 'completed') { ev.backgroundColor = '#78909c'; ev.borderColor = '#546e7a'; ev.editable = false; }
    if (task.status === 'deleted')   { ev.backgroundColor = '#ab47bc'; ev.borderColor = '#8e24aa'; ev.editable = false; }
    return ev;
}

function createDueEvent(task) {
    if (!task.due) return null;
    const isoDate = task.due.replace(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'
    );
    const start = new Date(isoDate);
    if (isNaN(start.getTime())) return null;

    let mins = 30;
    if (task.due_duration?.startsWith('PT')) {
        const m = task.due_duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
        if (m) mins = (parseInt(m[1] || 0) * 60 + parseInt(m[2] || 0)) || 30;
    }

    const ev = {
        id:              task.uuid + '_due',
        title:           '⚑ ' + task.description,
        start,
        end:             new Date(start.getTime() + mins * 60000),
        backgroundColor: '#e74c3c',
        borderColor:     '#c0392b',
        textColor:       '#fff',
        editable:        true,
        extendedProps:   { raw: task },
    };
    if (task.status === 'completed') { ev.backgroundColor = '#78909c'; ev.borderColor = '#546e7a'; ev.editable = false; }
    if (task.status === 'deleted')   { ev.backgroundColor = '#ab47bc'; ev.borderColor = '#8e24aa'; ev.editable = false; }
    return ev;
}

// ── Task detail modal ─────────────────────────────────────────────────────────
function showEventModal(fcEvent) {
    const task  = fcEvent.extendedProps?.raw || {};
    const modal = document.getElementById('task-detail-modal');
    if (!modal) return;

    document.getElementById('modal-task-title').textContent =
        task.description || fcEvent.title || 'Task';

    // Format a TW date for display in local time.
    // TW exports timed dates as compact UTC: '20260418T140000Z'
    // Parsing with the Z suffix makes JS treat it as UTC, and getHours()/getMinutes()
    // then return the user's local time — avoiding the UTC/local offset bug.
    const fmt = (twDate) => {
        if (!twDate) return twDate;
        const pad = n => String(n).padStart(2, '0');
        const timed = (twDate).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
        if (timed) {
            const d = new Date(`${timed[1]}-${timed[2]}-${timed[3]}T${timed[4]}:${timed[5]}:${timed[6]}Z`);
            if (!isNaN(d))
                return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
        const dateOnly = (twDate).match(/^(\d{4})(\d{2})(\d{2})$/);
        if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
        return twDate;
    };

    const rows = [];
    if (task.status && task.status !== 'pending')
        rows.push(`<tr><th>Status</th><td><em>${task.status}</em></td></tr>`);
    if (task.project)  rows.push(`<tr><th>Project</th><td>${task.project}</td></tr>`);
    if (task.priority) {
        const label = { H: 'High', M: 'Medium', L: 'Low' }[task.priority] || task.priority;
        rows.push(`<tr><th>Priority</th><td>${label}</td></tr>`);
    }
    if (task.due)            rows.push(`<tr><th>Due</th><td>${fmt(task.due)}</td></tr>`);
    if (task.scheduled)      rows.push(`<tr><th>Scheduled</th><td>${fmt(task.scheduled)}</td></tr>`);
    if (task.sched_duration) rows.push(`<tr><th>Duration</th><td>${task.sched_duration}</td></tr>`);
    if (task.tags?.length)
        rows.push(`<tr><th>Tags</th><td>${task.tags.map(t => `<span class="card-tag">${t}</span>`).join(' ')}</td></tr>`);
    if (task.urgency != null)
        rows.push(`<tr><th>Urgency</th><td>${Number(task.urgency).toFixed(1)}</td></tr>`);

    document.getElementById('modal-task-body').innerHTML = rows.length
        ? `<table class="task-detail-table">${rows.join('')}</table>`
        : '<em>No details available.</em>';

    const close = () => modal.classList.remove('show');
    const isActive    = !!task.start;
    const isEditable  = fcEvent.editable !== false;

    // Start / Stop
    const startBtn = document.getElementById('modal-start-btn');
    const stopBtn  = document.getElementById('modal-stop-btn');
    startBtn.style.display = (isActive || !isEditable) ? 'none' : '';
    stopBtn.style.display  = (!isActive || !isEditable) ? 'none' : '';
    startBtn.onclick = async () => {
        await taskCardManager.actionHandler.performTaskAction(task.uuid, 'start');
        close(); loadTasks();
    };
    stopBtn.onclick = async () => {
        await taskCardManager.actionHandler.performTaskAction(task.uuid, 'stop');
        close(); loadTasks();
    };

    // Edit
    document.getElementById('modal-edit-btn').onclick = () => {
        close();
        if (taskEditor) taskEditor.showForTask(task);
    };

    // Unschedule (calendar-specific — hide for non-editable/due events)
    const unschedBtn = document.getElementById('modal-unschedule-btn');
    unschedBtn.style.display = isEditable ? '' : 'none';
    unschedBtn.onclick = async () => {
        const r = await modifyTaskInBackend(task.uuid, { scheduled: null });
        if (r.success) { close(); loadTasks(); }
    };

    // Done
    document.getElementById('modal-done-btn').onclick = async () => {
        await taskCardManager.actionHandler.performTaskAction(task.uuid, 'done');
        close(); loadTasks();
    };

    // Delete
    document.getElementById('modal-delete-btn').onclick = () => {
        close();
        taskCardManager.actionHandler.confirmDelete(task.uuid);
    };

    document.getElementById('modal-close-btn').onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };
    modal.classList.add('show');
}

// ── Action handler ────────────────────────────────────────────────────────────
class CalendarTaskActionHandler extends TaskActionHandler {
    constructor() {
        super({
            onTaskUpdate: () => loadTasks(),
            onTaskDelete: () => loadTasks(),
            showNotification: (msg, type) =>
                document.dispatchEvent(new CustomEvent('tw-show-notification', { detail: { message: msg, type } }))
        });
    }
}

// ── Sidebar: filter + display ─────────────────────────────────────────────────
// Shared client-side filter predicate — used by both sidebar and calendar
function matchesNavFilter(task) {
    const state    = window.twNav ? window.twNav.getState() : {};
    const filter   = (state.filter   || '').trim().toLowerCase();
    const priority = (state.priority || '').trim().toLowerCase();
    const project  = (state.project  || '').trim().toLowerCase();
    const tags     = (state.tags     || '').split(',').map(t => t.trim()).filter(Boolean);
    if (filter   && !(task.description || '').toLowerCase().includes(filter))       return false;
    if (priority && !String(task.priority || '').toLowerCase().includes(priority))  return false;
    if (project  && !(task.project      || '').toLowerCase().includes(project))     return false;
    if (tags.length && !tags.every(t => (task.tags || []).includes(t)))             return false;
    return true;
}

function applyFiltersAndDisplay() {
    // Nav counter: dated tasks (calendar events) — status-only, no context, no text filter
    const navState      = window.twNav ? window.twNav.getState() : {};
    const calParams     = 'status=' + encodeURIComponent((navState.statuses || ['pending']).join(','));
    const calendarTasks = [...allTasks.filter(t => t.scheduled), ...dueTasks];
    let gt = window.twNav?.getGrandTotal(calParams) ?? null;
    window.twNav?.setCount(calendarTasks.length, gt ?? calendarTasks.length);
    if (gt === null && window.twNav) {
        fetch('/api/tasks?' + calParams).then(r => r.json()).then(data => {
            if (data.success && Array.isArray(data.tasks)) {
                gt = data.tasks.length;
                window.twNav.setGrandTotal(gt, calParams);
                window.twNav.setCount(calendarTasks.length, gt);
            }
        }).catch(() => {});
    }

    // Drag-list: always pending + context + nav filter
    const filtered = unplannedTasks.filter(matchesNavFilter);
    const title = document.getElementById('cal-unscheduled-title');
    if (title) title.textContent = `${filtered.length} Unscheduled`;
    displayUnplannedTasks(sortUnplanned(filtered));
}

function displayUnplannedTasks(tasks) {
    const container = document.getElementById('unplanned-tasks');
    if (tasks.length === 0) {
        container.innerHTML = unplannedTasks.length === 0
            ? `<div class="empty-message"><span class="icon">✅</span><p>No tasks to schedule</p></div>`
            : `<div class="empty-message"><p>No tasks match the current filter</p></div>`;
        return;
    }
    container.innerHTML = '';
    tasks.forEach(task => {
        const card = taskCardManager.createTaskCard(task);
        card.dataset.taskData = JSON.stringify(task);  // required by FullCalendar.Draggable
        container.appendChild(card);
    });
}

// ── Sidebar sort ──────────────────────────────────────────────────────────────
const SIDEBAR_SORT_FIELDS = [
    { value: 'urgency',     label: 'Urgency (default)' },
    { value: 'priority',    label: 'Priority' },
    { value: 'due',         label: 'Due date' },
    { value: 'description', label: 'Description' },
    { value: 'project',     label: 'Project' },
    { value: 'entry',       label: 'Created' },
    { value: 'modified',    label: 'Modified' },
    { value: 'start',       label: 'Started' },
    { value: 'scheduled',   label: 'Scheduled' },
    { value: 'wait',        label: 'Wait date' },
    { value: 'id',          label: 'ID' },
    { value: 'tags',        label: 'Tags' },
];

function sortUnplanned(tasks) {
    const field = localStorage.getItem('tw-sort-field') || 'urgency';
    const rev   = localStorage.getItem('tw-sort-reverse') === 'true' ? -1 : 1;
    if (field === 'urgency') return rev === 1 ? tasks : [...tasks].reverse();
    const PRI = { H: 3, M: 2, L: 1 };
    return [...tasks].sort((a, b) => {
        let av = a[field], bv = b[field];
        if (field === 'priority') { av = PRI[av] || 0; bv = PRI[bv] || 0; }
        else if (field === 'tags') { av = (av || []).join(','); bv = (bv || []).join(','); }
        av = av ?? ''; bv = bv ?? '';
        if (av < bv) return -1 * rev;
        if (av > bv) return  1 * rev;
        return 0;
    });
}

function initSidebarControls() {
    const cardBtn   = document.getElementById('cal-view-card');
    const listBtn   = document.getElementById('cal-view-list');
    const container = document.getElementById('unplanned-tasks');

    const setView = (mode) => {
        localStorage.setItem('tw-view-mode', mode);
        cardBtn.classList.toggle('active', mode === 'card');
        listBtn.classList.toggle('active', mode === 'list');
        if (container) container.classList.toggle('list-view', mode === 'list');
    };
    setView(localStorage.getItem('tw-view-mode') || 'card');
    cardBtn?.addEventListener('click', () => setView('card'));
    listBtn?.addEventListener('click', () => setView('list'));

    if (container) {
        container.addEventListener('click', (e) => {
            if (e.target.closest('[data-task-action]')) return;
            const card = e.target.closest('.task-card');
            if (!card) return;
            const mode = localStorage.getItem('tw-view-mode') || 'card';
            if (mode === 'list') card.classList.toggle('expanded');
            else card.classList.toggle('collapsed');
        });
    }

    const sortBtn    = document.getElementById('cal-sort-btn');
    const sortPopup  = document.getElementById('cal-sort-popup');
    const sortFields = document.getElementById('cal-sort-fields');
    const revBox     = document.getElementById('cal-sort-reverse');
    if (!sortBtn || !sortPopup || !sortFields || !revBox) return;

    const curField = localStorage.getItem('tw-sort-field') || 'urgency';
    sortFields.innerHTML = SIDEBAR_SORT_FIELDS.map(f =>
        `<label><input type="radio" name="cal-sort" value="${f.value}"${f.value === curField ? ' checked' : ''}> ${f.label}</label>`
    ).join('');
    revBox.checked = localStorage.getItem('tw-sort-reverse') === 'true';

    const updateSortBtn = () => {
        const f   = localStorage.getItem('tw-sort-field') || 'urgency';
        const rev = localStorage.getItem('tw-sort-reverse') === 'true';
        const def = f === 'urgency' && !rev;
        sortBtn.classList.toggle('sort-active', !def);
        sortBtn.title = def ? 'Sort'
            : `Sort: ${SIDEBAR_SORT_FIELDS.find(x => x.value === f)?.label || f}${rev ? ' ↑' : ' ↓'}`;
    };
    updateSortBtn();

    sortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sortPopup.style.display = sortPopup.style.display === 'none' ? 'block' : 'none';
    });
    sortFields.addEventListener('change', (e) => {
        if (e.target.name === 'cal-sort') {
            localStorage.setItem('tw-sort-field', e.target.value);
            updateSortBtn();
            applyFiltersAndDisplay();
        }
    });
    revBox.addEventListener('change', () => {
        localStorage.setItem('tw-sort-reverse', revBox.checked);
        updateSortBtn();
        applyFiltersAndDisplay();
    });
    document.addEventListener('click', () => { sortPopup.style.display = 'none'; });
    sortPopup.addEventListener('click', (e) => e.stopPropagation());
}

// ── Hover tooltip (shows full description when event block is small) ───────────
function setupCalTooltip() {
    const tip = document.createElement('div');
    tip.id = 'cal-tooltip';
    tip.className = 'cal-tooltip';
    tip.style.display = 'none';
    document.body.appendChild(tip);

    const calEl = document.getElementById('calendar');
    calEl.addEventListener('mouseover', e => {
        const evBlock = e.target.closest('.fc-timegrid-event, .fc-daygrid-event');
        if (!evBlock) { tip.style.display = 'none'; return; }
        const descEl = evBlock.querySelector('[data-desc]');
        if (!descEl)  { tip.style.display = 'none'; return; }
        tip.textContent = descEl.dataset.desc;
        tip.style.display = 'block';
        tip.style.left = (e.clientX + 14) + 'px';
        tip.style.top  = (e.clientY + 14) + 'px';
    });
    calEl.addEventListener('mousemove', e => {
        if (tip.style.display !== 'none') {
            tip.style.left = (e.clientX + 14) + 'px';
            tip.style.top  = (e.clientY + 14) + 'px';
        }
    });
    calEl.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}

// ── Notifications ─────────────────────────────────────────────────────────────
function showCalNotification(message, type = 'info') {
    document.dispatchEvent(new CustomEvent('tw-show-notification',
        { detail: { message, type } }));
}

// ── Backend API ───────────────────────────────────────────────────────────────
async function modifyTaskInBackend(taskId, taskData) {
    try {
        const r = await fetch(`/api/task/${taskId}/modify`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(taskData)
        });
        const d = await r.json();
        return { success: d.success, error: d.error || 'Unknown error' };
    } catch (err) {
        return { success: false, error: err.message || 'Network error' };
    }
}

async function addTaskToBackend(taskData) {
    try {
        const r = await fetch('/api/task/add', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(taskData)
        });
        const d = await r.json();
        return d.success && d.task
            ? { success: true,  task: d.task, error: null }
            : { success: false, task: null,   error: d.error || 'Unknown error' };
    } catch (err) {
        return { success: false, task: null, error: err.message || 'Network error' };
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

// Format a JS Date as local YYYY-MM-DDTHH:MM:SS for Taskwarrior (no Z, no UTC shift)
function toLocalISOString(date) {
    if (!date) return null;
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}` +
           `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function escAttr(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function parseEstTime(sched_duration) {
    if (!sched_duration) return null;
    if (sched_duration.startsWith('PT')) {
        const m = sched_duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (m) return parseInt(m[1] || 0) * 60 + parseInt(m[2] || 0) + Math.round(parseInt(m[3] || 0) / 60);
    }
    const m = sched_duration.match(/(\d+)h|(\d+)min/g);
    if (!m) return null;
    return m.reduce((sum, p) => sum + (p.includes('h') ? parseInt(p) * 60 : parseInt(p)), 0);
}

function DateFromISOtoTW(isoString) {
    if (!isoString) return null;
    if (/^\d{8}T\d{6}Z$/.test(isoString))
        return isoString.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(isoString))
        return isoString.slice(0, -1);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(isoString))
        return isoString;
    try {
        const d = new Date(isoString);
        if (!isNaN(d.getTime())) {
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        }
    } catch (_) {}
    return null;
}
