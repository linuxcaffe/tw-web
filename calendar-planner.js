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
// Two TW.store entries, emptied by every write (TW.api.write):
//   'tasks'  — shared with main.js: {params, tasks}
//   'extras' — shared with agenda.js: {cacheKey, planned, due}
function _readCache(params, cacheKey) {
    const s = TW.store.read('tasks',  s => s.params === params);
    const x = TW.store.read('extras', x => x.cacheKey === cacheKey);
    return s && x ? { allFetched: s.tasks, plannedTasks: x.planned, due: x.due } : null;
}

function _writeCache(params, cacheKey, allFetched, plannedTasks, due) {
    TW.store.save('tasks',  { params, tasks: allFetched });
    TW.store.save('extras', { cacheKey, planned: plannedTasks, due });
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

// ── DOMContentLoaded ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const _step = (name, fn) => { try { fn(); } catch(e) { console.error(`Calendar: ${name} failed`, e); throw e; } };

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

    _step('initializeCalendar', () => {
        initializeCalendar();
        showView({ timeGridDay: 'day', dayGridMonth: 'month' }[calendar.view.type] || 'week');
    });
    _step('setupEventListeners', () => setupEventListeners());
    _step('initSidebarControls', () => initSidebarControls());
    _step('loadTasks', () => loadTasks());
    _step('setupCalTooltip', () => setupCalTooltip());
    _step('setupOffscreenMarkers', () => setupOffscreenMarkers());

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
        slotMinTime:          '00:00:00',   // always all 24 hours: nothing lands in hours you can't see;
        slotMaxTime:          '24:00:00',   // the day range shades (businessHours), scrollTime places the view
        firstDay:             1,         // Monday
        nowIndicator:         true,
        allDaySlot:           true,      // date-only (midnight) tasks; the grid starts at cal_day_start
        editable:             true,      // drag + resize on scheduled events
        droppable:            true,      // accept external drags from sidebar
        eventMinHeight:       18,
        stickyHeaderDates:       true,      // day names stay visible while scrolling time grid
        eventResizableFromStart: true,      // resize from leading edge too
        dayMaxEvents:            true,      // month view: "+N more" instead of overflowing
        weekNumbers:             true,      // ISO week numbers in gutter (TW users love these)
        weekNumberFormat:        { week: 'narrow' },  // "W16" compact style
        views: { timeGridWeek: { dayHeaderFormat: { weekday: 'short' } } },   // the title has the dates
        // row size, drag snap and start hour come from the view's zoom step (applyZoom)
        ...zoomOptions(_zoomStep(_fcToZoomView(_calSettings.cal_default_view || 'timeGridWeek'))),
        scrollTimeReset:         false,      // don't jump back on week/day navigation
        selectable:              true,       // drag to select a time range
        selectMirror:            true,       // ghost event preview while selecting
        businessHours: {                     // hours outside the day range (settings) are shaded
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            startTime:  _calSettings.cal_day_start || '06:00:00',
            endTime:    _calSettings.cal_day_end   || '23:00:00',
        },
        moreLinkClick: (info) => {           // "+N more" → day view with correct button state
            goToDay(info.date);
            return 'stop';
        },
        navLinks:         true,              // day names (Week), day numbers (Month) open that day
        navLinkDayClick:  (date) => goToDay(date),
        navLinkWeekClick: (date) => { changeView('week'); calendar.gotoDate(date); },

        eventTimeFormat: {
            hour:           'numeric',
            minute:         '2-digit',
            omitZeroMinute: true,
            meridiem:       'short'
        },

        // Custom event content: priority dot + description + project label
        eventContent: renderEventContent,

        // Callbacks
        eventClick:   (info) => { if (!info.event.extendedProps?.layer) showEventModal(info.event); },
        eventDidMount: (info) => {           // a layer item (holiday) says what it is on hover
            const p = info.event.extendedProps;
            if (p?.layer) info.el.title = info.event.title + (p.detail ? ` (${p.detail})` : '');
        },
        eventDrop:    handleEventDrop,
        eventResize:  handleEventResize,
        eventReceive: handleEventReceive,
        select:       handleSelect,          // drag/click to create — replaces dateClick

        datesSet:  () => { updateCalendarTitle(); scheduleMarkers(); scheduleDaylight(); layersFollowView(); },
        slotLabelDidMount: () => { scheduleDaylight(); scheduleLayerMarks(); },   // a rebuilt grid needs them again
        eventsSet: () => { scheduleMarkers(); scheduleLayerMarks(); },
    });

    calendar.addEventSource(layerEventSource());
    calendar.render();
    setupExternalDrag();
    zoomTitle('week');
    zoomTitle('day');

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
            calendar.scrollToTime(zoomOptions(_zoomStep(_fcToZoomView(calendar.view.type))).scrollTime);
        });
    });
    window.addEventListener('resize', fitCalHeight);
    if (col) new ResizeObserver(fitCalHeight).observe(col);
}

function fitCalHeight() {
    if (!calendar) return;
    // narrow screens: the sticky day headers sit below the nav bar (calendar-planner.css)
    const nav = document.getElementById('tw-nav-bar');
    if (nav) document.documentElement.style.setProperty('--tw-nav-h', nav.offsetHeight + 'px');
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
            const kind = EVENT_KINDS.scheduled;
            return {
                id:              task.uuid,
                title:           task.description || '',
                duration:        { minutes: parseDuration(task[kind.duration]) || kind.defaultMins },
                backgroundColor: kind.bg,
                borderColor:     kind.border,
                textColor:       '#fff',
                extendedProps:   { raw: task, kind: 'scheduled' },
            };
        }
    });
}

// ── Click or drag empty slots → create new task ──────────────────────────────
// Replaces dateClick: handles both single-slot clicks and dragged ranges.
// When the user drags a time range, sched_duration is pre-filled from the selection length.
// An all-day selection (the all-day strip) gives a date only: midnight, no duration.
// In Month a click or drag opens Day view instead.
function handleSelect(info) {
    calendar.unselect();   // clear selection highlight before editor opens
    if (calendar.view.type === 'dayGridMonth') {   // Month navigates; adding happens in Day view
        goToDay(info.start);
        return;
    }
    if (!taskEditor) return;

    const localDT = toLocalISOString(info.start).slice(0, 16);   // datetime-local: no seconds
    const mins    = info.allDay ? 0 : Math.round((info.end - info.start) / 60000);

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
    // A ring round it marks a recurring template or instance (TW.recur); without a priority, the ring alone
    const recur = TW.recur.kind(task);
    if (pc || recur) {
        const dot = document.createElement('span');
        dot.className = 'fc-pri-dot' + (pc ? ` fc-pri-${pc}` : '') + (recur ? ` recur-${recur}` : '');
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
function _isDueEvent(fcEvent) { return fcEvent.extendedProps?.kind === 'due'; }

// A move writes the new start only: an event without a duration is drawn at its kind's default
// length, which is not the task's. A resize writes the start and the duration. An all-day event
// writes local midnight (a date with no time), and the page reloads, since a hook may set the time
// (time-defaults).
async function writeEventTimes(info, withDuration, failText) {
    const ev   = info.event;
    const task = ev.extendedProps?.raw;
    if (!task?.uuid) return;
    const kind    = EVENT_KINDS[ev.extendedProps.kind];
    const modData = { [kind.field]: toLocalISOString(ev.start) };
    if (withDuration && ev.end) modData[kind.duration] = minsToISO(Math.round((ev.end - ev.start) / 60000));

    const result = await modifyTaskInBackend(task.uuid, modData);
    if (!result.success) {
        info.revert();
        showCalNotification(failText + ': ' + (result.error || ''), 'error');
        return;
    }
    if (ev.allDay) { loadTasks(); return; }
    const updated = { ...task, [kind.field]: toTWDate(ev.start) };
    if (modData[kind.duration]) updated[kind.duration] = modData[kind.duration];
    ev.setExtendedProp('raw', updated);
    const idx = allTasks.findIndex(t => t.uuid === task.uuid);
    if (idx !== -1) allTasks[idx] = updated;
    showCalNotification('Task updated', 'info');
}

function handleEventDrop(info)   { return writeEventTimes(info, false, 'Failed to move task'); }
function handleEventResize(info) { return writeEventTimes(info, true,  'Failed to resize'); }

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
    window.twNav?.narrow?.addEventListener('change', updateCalendarTitle);   // the year comes and goes
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

// ── Zoom ──────────────────────────────────────────────────────────────────────
// Week and Day each have three zoom steps from settings (cal_zoom): a row size and the hour the
// view starts at. Clicking the active view's button moves to the next step; changing view or
// reloading goes back to that view's default. All 24 hours stay reachable by scrolling.
const _ZOOM_FALLBACK = { steps: [['00:15:00', '08:00:00'], ['00:30:00', '08:00:00'], ['01:00:00', '00:00:00']],
                         default: 1 };
const _zoomAt = {};   // view → current step index (this page load only)

function _fcToZoomView(fcType) {
    return { timeGridWeek: 'week', timeGridDay: 'day' }[fcType] || null;
}

function _zoomConf(view) {
    return _calSettings.cal_zoom?.[view] || _ZOOM_FALLBACK;
}

// The view's current step, starting at its default
function _zoomStep(view) {
    if (!view) return _ZOOM_FALLBACK.steps[_ZOOM_FALLBACK.default];
    const conf = _zoomConf(view);
    if (!(view in _zoomAt)) _zoomAt[view] = conf.default;
    return conf.steps[_zoomAt[view]];
}

// FullCalendar options for a step. Drags snap to 15 minutes, or to the row when rows are smaller.
function zoomOptions([slot, start]) {
    return { slotDuration: slot, snapDuration: slot < '00:15:00' ? slot : '00:15:00', scrollTime: start };
}

function applyZoom(view) {
    const opts = zoomOptions(_zoomStep(view));
    calendar.setOption('slotDuration', opts.slotDuration);
    calendar.setOption('snapDuration', opts.snapDuration);
    // FullCalendar keeps the label cells a new row size shares (07:00 at 30 and at 60 min), so no
    // mount event fires: check the daylight stripe once it has redrawn
    requestAnimationFrame(() => { calendar.scrollToTime(opts.scrollTime); paintDaylight(); });
    zoomTitle(view);
}

// The view button's tooltip names its current step
function zoomTitle(view) {
    const btn = document.querySelector(`.view-btn[data-view="${view}"]`);
    if (!btn) return;
    const [slot, start] = _zoomStep(view);
    const mins = parseInt(slot.slice(0, 2)) * 60 + parseInt(slot.slice(3, 5));
    btn.title = `${mins} min rows from ${start.slice(0, 5)}; click again to zoom`;
}

// Open one day in Day view, with the view buttons in step (Month click, Week day name, "+N more").
function goToDay(date) {
    changeView('day');
    calendar.gotoDate(date);
}

function changeView(view) {
    if (view === 'today') {
        calendar.today();
        return;
    }
    const fcViews   = { week: 'timeGridWeek', day: 'timeGridDay', month: 'dayGridMonth' };
    const currentFC = calendar.view.type;
    const isTimegrid = view === 'week' || view === 'day';

    // Repeated click on the active Week/Day → its next zoom step; another view → its default step
    if (isTimegrid && currentFC === fcViews[view]) {
        _zoomAt[view] = (_zoomAt[view] + 1) % 3;
        applyZoom(view);
    } else if (fcViews[view]) {
        if (isTimegrid) delete _zoomAt[view];
        calendar.changeView(fcViews[view]);
        if (isTimegrid) applyZoom(view);
    }

    showView(view);
    scheduleMarkers();
    updateCalendarTitle();
}

// The view buttons and #calendar's data-view follow the view shown (the page's markup says Week)
function showView(view) {
    document.getElementById('calendar').dataset.view = view;
    document.querySelectorAll('.view-btn[data-view]').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.view === view)
    );
}

// The title above the calendar. Narrow (twNav.narrow, where the brand reads "Task"), Day and
// Week drop the year so both arrows fit: "October 17", "Oct 12 – 18".
function updateCalendarTitle() {
    const titleEl = document.getElementById('calendar-title');
    if (titleEl) {
        const v = calendar.view;
        let text = v.title;
        if (window.twNav?.narrow?.matches) {
            if (v.type === 'timeGridDay') {
                text = calendar.formatDate(v.currentStart, { month: 'long', day: 'numeric' });
            } else if (v.type === 'timeGridWeek') {
                const last = new Date(v.currentEnd.getTime() - 86400000);
                text = calendar.formatRange(v.currentStart, last, { month: 'short', day: 'numeric' });
            }
        }
        titleEl.textContent = text;
    }

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
    const ctxParam    = context ? '&context=' + encodeURIComponent(context) : '';
    // Drag-list: always pending, in the context, blind to the status bar
    const params      = 'status=pending' + ctxParam;
    // Calendar events: follow the status bar only (completed, deleted, waiting, recurring all
    // visible), never the context or the nav filter
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
    scheduledTasks.forEach(task => { const e = createCalendarEvent(task, 'scheduled'); if (e) events.push(e); });
    dueTasks.forEach(task =>       { const e = createCalendarEvent(task, 'due');       if (e) events.push(e); });

    _calEventSource = calendar.addEventSource(events);
}

// ── Layers: things that aren't tasks (TW.layers: holidays, the moon, the seasons) ──
// Their own event source, separate from the tasks' (_calEventSource): FullCalendar asks for the
// visible range. All-day, never editable, not counted, not narrowed by the nav filter; a click
// does nothing (eventClick), hover gives the title and detail (eventDidMount). A moment (a moon
// phase, a solstice) is a chip with its icon in Month, and a mark at its time in Week and Day
// (paintLayerMarks), where the all-day row stays for holidays.
let _layerMoments = [];   // the moments in the visible range, for the marks
let _layerGrid    = null; // was the last fetch for a time grid? (Month ↔ Week/Day refetches)

function layerEventSource() {
    const key = TW.layers.dayKey;
    const iso = k => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
    return {
        id: 'tw-layers',
        events(info, success) {
            const last = new Date(info.end); last.setDate(last.getDate() - 1);   // FC's end is exclusive
            const grid = calendar.view.type.startsWith('timeGrid');
            _layerGrid = grid;
            TW.layers.fetch(key(info.start), key(last), _calSettings).then(items => {
                _layerMoments = items.filter(it => it.at);
                scheduleLayerMarks();
                success(items.filter(it => !(grid && it.at)).map(it => ({
                    id:            `layer-${it.layer}-${it.start}-${it.title}`,
                    title:         it.icon ? `${it.icon} ${it.title}` : it.title,
                    start:         iso(it.start),
                    end:           iso(TW.layers.addDays(it.end, 1)),
                    allDay:        true,
                    editable:      false,
                    classNames:    ['tw-layer', `tw-layer-${it.layer}`, ...(it.at ? ['tw-layer-moment'] : [])],
                    extendedProps: { layer: it.layer, detail: it.detail || '' },
                })));
            }).catch(() => success([]));
        },
    };
}

// A view change between Month and Week/Day that keeps the range (it rarely does) still needs the
// moments moved between chips and marks.
function layersFollowView() {
    const grid = calendar.view.type.startsWith('timeGrid');
    if (_layerGrid !== null && grid !== _layerGrid) calendar.getEventSourceById('tw-layers')?.refetch();
    scheduleLayerMarks();
}

let _layerMarkFrame = 0;
function scheduleLayerMarks() {
    cancelAnimationFrame(_layerMarkFrame);
    _layerMarkFrame = requestAnimationFrame(paintLayerMarks);
}
// Week/Day: a dashed line across the moment's day column at its time, with its icon at the right;
// hover the icon for the name and time. Placed by percentage of the 24-hour grid, like the
// daylight stripe, so zoom steps don't move it.
function paintLayerMarks() {
    document.querySelectorAll('#calendar .tw-sky-mark').forEach(el => el.remove());
    if (!calendar?.view.type.startsWith('timeGrid')) return;
    const pad = n => String(n).padStart(2, '0');
    for (const it of _layerMoments) {
        const d = it.at;
        const frame = document.querySelector(`#calendar .fc-timegrid-col[data-date="${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}"] .fc-timegrid-col-frame`);
        if (!frame) continue;
        const mark = document.createElement('div');
        mark.className = `tw-sky-mark tw-sky-${it.layer}`;
        mark.style.top = `${((d.getHours() * 60 + d.getMinutes()) / 14.4).toFixed(3)}%`;
        const icon = document.createElement('span');
        icon.className   = 'tw-sky-icon';
        icon.textContent = it.icon || '•';
        icon.title       = `${it.title} ${it.time}`;
        mark.appendChild(icon);
        frame.appendChild(mark);
    }
}

// ── Event object factory ───────────────────────────────────────────────────────
// Two kinds of event: a scheduled task (blue), and a due task with no scheduled date (red ⚑).
// defaultMins is the height an event is drawn at when the task has no duration; it is never
// written to the task.
const EVENT_KINDS = {
    scheduled: { field: 'scheduled', duration: 'sched_duration', defaultMins: 60, idSuffix: '',
                 prefix: '',   bg: '#4a90e2', border: '#357abd' },
    due:       { field: 'due',       duration: 'due_duration',   defaultMins: 30, idSuffix: '_due',
                 prefix: '⚑ ', bg: '#e74c3c', border: '#c0392b' },
};
const STATUS_COLOURS = {
    completed: { bg: '#78909c', border: '#546e7a' },
    deleted:   { bg: '#ab47bc', border: '#8e24aa' },
};

// A task at local midnight has a date and no time, so it is an all-day event: in the all-day
// strip on Week and Day, as a bar on Month. It can be moved but not resized.
function createCalendarEvent(task, kindName) {
    const kind  = EVENT_KINDS[kindName];
    const start = parseTWDate(task[kind.field]);
    if (!start) return null;

    const allDay = isLocalMidnight(start);
    const ev = {
        id:              task.uuid + kind.idSuffix,
        title:           kind.prefix + task.description,
        start,
        allDay,
        backgroundColor: kind.bg,
        borderColor:     kind.border,
        textColor:       '#fff',
        editable:        true,
        durationEditable: !allDay,
        extendedProps:   { raw: task, kind: kindName },
    };
    if (!allDay) {
        const mins = parseDuration(task[kind.duration]) || kind.defaultMins;
        ev.end = new Date(start.getTime() + mins * 60000);
    }
    const done = STATUS_COLOURS[task.status];
    if (done) { ev.backgroundColor = done.bg; ev.borderColor = done.border; ev.editable = false; }
    return ev;
}

// ── Task detail modal ─────────────────────────────────────────────────────────
function showEventModal(fcEvent) {
    const task  = fcEvent.extendedProps?.raw || {};
    const modal = document.getElementById('task-detail-modal');
    if (!modal) return;

    document.getElementById('modal-task-title').textContent =
        task.description || fcEvent.title || 'Task';

    // A TW date in local time: dd/mm/yyyy hh:mm, or the date alone at midnight
    const fmt = (twDate) => {
        const d = parseTWDate(twDate);
        if (!d) return twDate;
        const pad  = n => String(n).padStart(2, '0');
        const date = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
        return isLocalMidnight(d) ? date : `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const rows = [];
    if (task.status && task.status !== 'pending')
        rows.push(`<tr><th>Status</th><td><em>${escHtml(task.status)}</em></td></tr>`);
    if (task.project)  rows.push(`<tr><th>Project</th><td>${escHtml(task.project)}</td></tr>`);
    if (task.priority) {
        const label = { H: 'High', M: 'Medium', L: 'Low' }[task.priority] || task.priority;
        rows.push(`<tr><th>Priority</th><td>${escHtml(label)}</td></tr>`);
    }
    if (task.due)            rows.push(`<tr><th>Due</th><td>${escHtml(fmt(task.due))}</td></tr>`);
    if (task.scheduled)      rows.push(`<tr><th>Scheduled</th><td>${escHtml(fmt(task.scheduled))}</td></tr>`);
    const durField = EVENT_KINDS[fcEvent.extendedProps?.kind]?.duration || 'sched_duration';
    if (task[durField])      rows.push(`<tr><th>Duration</th><td>${escHtml(task[durField])}</td></tr>`);
    if (task.tags?.length)
        rows.push(`<tr><th>Tags</th><td>${task.tags.map(t => `<span class="card-tag">${escHtml(t)}</span>`).join(' ')}</td></tr>`);
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

    // Unschedule (calendar-specific — hide for non-editable/due events: a due event's task
    // has no scheduled date to clear; bug 10)
    const unschedBtn = document.getElementById('modal-unschedule-btn');
    unschedBtn.style.display = (isEditable && !_isDueEvent(fcEvent)) ? '' : 'none';
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
function applyFiltersAndDisplay() {
    // Nav counter: dated tasks shown / the status-only total (both status-only)
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
    const filtered = TW.filter.navTasks(unplannedTasks);
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
    const allLookup = new Map((window._twAllTasks || unplannedTasks).map(t => [t.uuid, t]));
    tasks.forEach(task => taskCardManager.appendWithDeps(container, task, allLookup));
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

// Same sort (and the same saved choice) as the List
function sortUnplanned(tasks) {
    return TW.sort.tasks(tasks, localStorage.getItem('tw-sort-field') || 'urgency',
                         localStorage.getItem('tw-sort-reverse') === 'true');
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

// ── Off-screen markers ────────────────────────────────────────────────────────
// Week and Day draw 24 hours but open at a zoom step's start hour, so events can be scrolled out of view.
// "↑ N earlier" / "↓ N later" sit at the top and bottom edge of the visible grid; a click scrolls
// to the nearest hidden event. The grid scrolls inside FullCalendar's scroller, or with the page
// when the height is auto (narrow screens), so the visible band is the scroller cut to the window.
let _markerFrame = 0;

function setupOffscreenMarkers() {
    for (const dir of ['up', 'down']) {
        const btn = document.createElement('button');
        btn.id        = `cal-marker-${dir}`;
        btn.className = `cal-marker cal-marker-${dir}`;
        btn.style.display = 'none';
        btn.addEventListener('click', () => scrollToHidden(dir));
        document.body.appendChild(btn);
    }
    // scroll doesn't bubble: capture it from the scroller inside #calendar, and the page's own
    document.getElementById('calendar').addEventListener('scroll', scheduleMarkers, true);
    window.addEventListener('scroll', scheduleMarkers, { passive: true });
    window.addEventListener('resize', scheduleMarkers);
}

// ── Daylight in the time column ───────────────────────────────────────────────
// A cyan stripe down the left edge of the time column, from sunrise to sunset (TW.sun, for the
// settings' place; default Toronto). Nothing goes behind the hour labels: a tint there made them
// hard to read. The grid always draws all 24 hours, so the stripe is placed by percentage and a
// zoom step, which only changes row heights, can't move it. Day view uses its day; Week the
// middle of the week (sunrise moves 2–3 minutes in a week). Hovering the column gives the times.
// FullCalendar rebuilds the grid on a view change, so paintDaylight finds or makes the stripe.
let _daylightFrame = 0;
function scheduleDaylight() {
    cancelAnimationFrame(_daylightFrame);
    _daylightFrame = requestAnimationFrame(paintDaylight);
}
function paintDaylight() {
    const slots = document.querySelector('#calendar .fc-timegrid-slots');
    const axis  = document.querySelector('#calendar .fc-timegrid-cols td.fc-timegrid-axis');
    let stripe  = slots?.querySelector(':scope > .tw-daylight');
    const v     = calendar.view;
    const day   = v.type === 'timeGridWeek' ? new Date(v.currentStart.getTime() + 3 * 864e5) : v.currentStart;
    const sun   = slots && _calSettings.cal_daylight !== false
        ? TW.sun.times(day, _calSettings.cal_latitude ?? 43.65, _calSettings.cal_longitude ?? -79.38) : null;
    if (!sun || sun.sunrise >= sun.sunset) {   // off, or polar night
        stripe?.remove();
        if (axis) axis.title = '';
        return;
    }
    if (!stripe) {
        stripe = document.createElement('div');
        stripe.className = 'tw-daylight';
        slots.prepend(stripe);
    }
    stripe.style.top    = `${(sun.sunrise / 14.4).toFixed(3)}%`;
    stripe.style.height = `${((sun.sunset - sun.sunrise) / 14.4).toFixed(3)}%`;

    const clock = m => { m = Math.round(m); const h = Math.floor(m / 60) % 12 || 12;
                         return `${h}:${String(m % 60).padStart(2, '0')}`; };
    if (axis) axis.title = `Sunrise ${clock(sun.sunrise)} · Sunset ${clock(sun.sunset)}` +
                           (v.type === 'timeGridWeek' ? ' (mid-week)' : '');
}

function scheduleMarkers() {
    cancelAnimationFrame(_markerFrame);
    _markerFrame = requestAnimationFrame(updateOffscreenMarkers);
}

// The visible band of the time grid, and the timed events above and below it
function _offscreenEvents() {
    const body = document.querySelector('#calendar .fc-timegrid-body');
    if (!body || !calendar?.view.type.startsWith('timeGrid')) return null;
    const scroller = body.closest('.fc-scroller');
    const sr       = scroller.getBoundingClientRect();
    // below the day headers and the nav bar, both sticky when the page scrolls
    const edges    = ['#calendar .fc-col-header', '#tw-nav-bar']
        .map(sel => document.querySelector(sel)?.getBoundingClientRect().bottom || 0);
    const top      = Math.max(sr.top, 0, ...edges);
    const bottom   = Math.min(sr.bottom, window.innerHeight);
    const above = [], below = [];
    body.querySelectorAll('.fc-timegrid-event').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.height === 0) return;
        if (r.bottom <= top) above.push(r);
        else if (r.top >= bottom) below.push(r);
    });
    return { scroller, sr, top, bottom, above, below };
}

function updateOffscreenMarkers() {
    const up   = document.getElementById('cal-marker-up');
    const down = document.getElementById('cal-marker-down');
    if (!up || !down) return;
    const o = _offscreenEvents();
    const place = (btn, list, word, y) => {
        if (!o || list.length === 0) { btn.style.display = 'none'; return; }
        btn.textContent   = `${btn === up ? '↑' : '↓'} ${list.length} ${word}`;
        btn.style.display = '';
        btn.style.left    = `${o.sr.left + o.sr.width / 2}px`;
        btn.style.top     = `${y}px`;
    };
    place(up,   o?.above || [], 'earlier', o ? o.top + 6 : 0);
    place(down, o?.below || [], 'later',   o ? o.bottom - 6 - (down.offsetHeight || 24) : 0);
}

// Bring the nearest hidden event above (or below) to the top of the visible band
function scrollToHidden(dir) {
    const o = _offscreenEvents();
    if (!o) return;
    const list = dir === 'up' ? o.above : o.below;
    if (!list.length) return;
    const target = dir === 'up'
        ? list.reduce((a, b) => (b.bottom > a.bottom ? b : a))
        : list.reduce((a, b) => (b.top < a.top ? b : a));
    const delta = target.top - (o.top + 8);
    if (o.scroller.scrollHeight > o.scroller.clientHeight) o.scroller.scrollTop += delta;
    else window.scrollBy(0, delta);
    scheduleMarkers();
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
    const d = await TW.api.write('PUT', `/api/task/${taskId}/modify`, taskData);
    return { success: d.success, error: d.error || 'Unknown error' };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

// Format a JS Date as local YYYY-MM-DDTHH:MM:SS for Taskwarrior (no Z, no UTC shift)
function toLocalISOString(date) {
    if (!date) return null;
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}` +
           `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Task text is user data (and can come from hooks, bookmarks, sync):
// escape it before it reaches innerHTML (security review S6).
function escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


// TW exports dates as compact UTC ('20260418T140000Z'); null for anything else.
// A Date shows in local time, so a date-only task (local midnight) reads back as 00:00.
function parseTWDate(s) {
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s || '');
    if (!m) return null;
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
    return isNaN(d) ? null : d;
}

// A Date as TW's compact UTC form, as export gives it
function toTWDate(date) {
    return date.toISOString().replace(/[-:]|\.\d{3}/g, '');
}

function isLocalMidnight(d) {
    return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
}

// An ISO 8601 duration as TW exports a duration UDA (PT1H30M, P2D, P1DT2H) → minutes; null if not one
function parseDuration(s) {
    const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s || '');
    if (!m) return null;
    const [, d, h, mi, sec] = m.map(x => parseInt(x || 0));
    return d * 1440 + h * 60 + mi + Math.round(sec / 60) || null;
}
