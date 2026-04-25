/**
 * TaskActionHandler - Interface pour gérer les actions des tâches
 * Version autonome sans dépendance à l'objet app global
 */
class TaskActionHandler {
    /**
     * @param {Object} options - Options de configuration
     * @param {Function} options.onTaskUpdate - Callback pour mise à jour des tâches
     * @param {Function} options.onTaskDelete - Callback pour suppression de tâche
     * @param {Function} options.onEditRequest - Callback pour demande d'édition
     * @param {Function} options.showNotification - Callback pour afficher des notifications
     */
    constructor(options = {}) {
        this.onTaskUpdate = options.onTaskUpdate || (() => {});
        this.onTaskDelete = options.onTaskDelete || (() => {});
        this.onEditRequest = options.onEditRequest || (() => {});
        this.showNotification = options.showNotification || (() => {});
    }

    async performTaskAction(taskUuid, action) {
        const actionMap = {
            'start': 'POST',
            'stop': 'POST',
            'done': 'POST',
            'delete': 'DELETE'
        };

        const method = actionMap[action];
        const endpoint = action === 'delete' ? `/api/task/${taskUuid}/delete` : `/api/task/${taskUuid}/${action}`;

        try {
            const response = await fetch(endpoint, { method });
            const data = await response.json();

            if (data.success) {
                if (action === 'delete' || action === 'done') {
                    this.onTaskDelete(taskUuid);
                } else if (data.task) {
                    this.onTaskUpdate(data.task);
                } else {
                    this.onTaskUpdate(null);
                }
                if (data.deferred_cmd) {
                    window.twTerminal?.offerTerminal(data.deferred_cmd);
                }
                const msg = data.warnings?.length
                    ? data.warnings.join('\n')
                    : (data.message || `Task ${action} successful`);
                window.twNav?.showOutput(msg);
            } else if (data.terminal_launched) {
                window.twNav?.showOutput('Opening in terminal…');
            } else if (data.timed_out && data.cmd) {
                window.twTerminal?.offerTerminal(data.cmd);
            } else {
                window.twNav?.showOutput(data.message || data.error || `Failed to ${action} task`);
            }
        } catch (error) {
            window.twNav?.showOutput('Network error: ' + error.message);
        }
    }
    

    
    confirmDelete(taskUuid) {
        if (confirm('Are you sure you want to delete this task?')) {
            this.performTaskAction(taskUuid, 'delete');
        }
    }
}

/**
 * ScriptTaskActionHandler - Implémentation spécifique pour main.js
 * Maintenue pour compatibilité ascendante
 */
class ScriptTaskActionHandler extends TaskActionHandler {
    constructor() {
        super({
            onTaskUpdate: (task) => {
                if (task) {
                    const taskIndex = app.tasks.findIndex(t => t.uuid === task.uuid);
                    if (taskIndex !== -1) {
                        app.tasks[taskIndex] = task;
                    }
                }
                app.renderTasks();
            },
            onTaskDelete: (taskUuid) => {
                app.removeTaskCard(taskUuid);
                app.tasks = app.tasks.filter(task => task.uuid !== taskUuid);
            },
            onEditRequest: (task) => {
                if (typeof taskEditor !== 'undefined') {
                    taskEditor.showForTask(task);
                } else {
                    console.error('taskEditor is not defined');
                }
            },
            showNotification: (message, type) => app.showNotification(message, type)
        });
    }
}


class TaskCardManager {
    static SYSTEM_TAGS = new Set(['PENDING','UNBLOCKED','TAGGED','ACTIVE','ANNOTATED','RECURRING','WAITING','DELETED','COMPLETED']);

    constructor(actionHandler = null) {
        this.actionHandler = actionHandler || new TaskActionHandler();
        // Single delegated listener for all action buttons
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-task-action]');
            if (!btn) return;
            const uuid   = btn.dataset.taskUuid;
            const action = btn.dataset.taskAction;
            if (!uuid || !action) return;
            if (action === 'delete') {
                this.actionHandler.confirmDelete(uuid);
            } else if (action === 'edit') {
                const card = btn.closest('.task-card');
                if (card && typeof taskEditor !== 'undefined') {
                    taskEditor.showForTask(JSON.parse(card.dataset.taskData));
                }
            } else {
                this.actionHandler.performTaskAction(uuid, action);
            }
        });
    }

    createTaskCard(task) {
        const pri    = String(task.priority || '');
        const tags   = (task.tags || []).filter(t => !TaskCardManager.SYSTEM_TAGS.has(t));
        const active = !!task.start;

        const priClass = ['1','2','H'].includes(pri) ? 'pri-high'
                       : ['3','4','M'].includes(pri) ? 'pri-med'
                       : ['5','6','L'].includes(pri) ? 'pri-low' : '';

        const proj      = task.project ? `<span class="card-proj">${this._e(task.project)}</span>` : '';
        const dueHtml   = this._due(task.due);
        const schedHtml = this._sched(task.scheduled);
        const durHtml   = task.sched_duration ? `<span class="card-dur">⏱ ${this._fmtDur(this._parseDur(task.sched_duration))}</span>` : '';
        const tagsHtml  = tags.map(t => `<span class="card-tag">+${this._e(t)}</span>`).join('');

        const anns = task.annotations || [];
        const annHtml = anns.length
            ? `<div class="card-annotations">${anns.map(a => `<div class="card-ann">${this._e(a.description)}</div>`).join('')}</div>`
            : '';

        const extrasStr  = this._extras(task);
        const extrasHtml = extrasStr ? `<div class="card-extras">${this._e(extrasStr)}</div>` : '';

        const card = document.createElement('div');
        card.className = 'task-card';
        if (active) card.classList.add('task-started');
        card.dataset.taskId   = task.uuid;
        card.dataset.taskData = JSON.stringify(task);
        if (pri) card.dataset.pri = pri;
        if      (task.scheduled && task.due) card.dataset.type = 'both';
        else if (task.scheduled)             card.dataset.type = 'scheduled';
        else if (task.due)                   card.dataset.type = 'due';

        const dotHtml     = priClass ? `<span class="card-pri-dot ${priClass}"></span>` : '';
        const metaContent = proj + dueHtml + schedHtml + durHtml + tagsHtml;
        const metaHtml    = metaContent ? `<div class="card-meta">${metaContent}</div>` : '';
        if (anns.length) card.dataset.annotated = '1';

        card.innerHTML =
            `<div class="card-main">` +
                `<div class="card-desc">${dotHtml}<span class="card-desc-text">${this._e(task.description)}</span></div>` +
                metaHtml +
                extrasHtml +
                annHtml +
            `</div>` +
            `<div class="card-actions">` +
                `<button class="ca-btn ca-stop"   data-task-action="stop"   data-task-uuid="${task.uuid}" ${active ? '' : 'style="display:none"'}>⏸</button>` +
                `<button class="ca-btn ca-start"  data-task-action="start"  data-task-uuid="${task.uuid}" ${active ? 'style="display:none"' : ''}>▶</button>` +
                `<button class="ca-btn ca-edit"   data-task-action="edit"   data-task-uuid="${task.uuid}">✏</button>` +
                `<button class="ca-btn ca-done"   data-task-action="done"   data-task-uuid="${task.uuid}">✓</button>` +
                `<button class="ca-btn ca-delete" data-task-action="delete" data-task-uuid="${task.uuid}">✕</button>` +
            `</div>`;

        return card;
    }

    _extras(task) {
        // Fields rendered elsewhere — never appear in extras
        const CORE = new Set([
            'uuid','description','status','priority','project','tags',
            'due','scheduled','sched_duration',
            'entry','modified','start','end',
            'annotations','mask','imask','parent',
            'id','urgency','depends','wait','recur',
        ]);
        const pairs = [];  // {key, text} — sorted alpha after id

        if (task.depends) {
            const deps = Array.isArray(task.depends) ? task.depends
                       : String(task.depends).split(',').map(s => s.trim());
            pairs.push({ key: 'dep', text: 'dep:' + deps.map(u => u.slice(0, 8)).join(',') });
        }

        if (task.recur) pairs.push({ key: 'recur', text: `recur:${task.recur}` });

        if (task.urgency != null)
            pairs.push({ key: 'urgency', text: `urgency:${Math.round(task.urgency * 10) / 10}` });

        if (task.wait) {
            const m = task.wait.match(/^(\d{4})(\d{2})(\d{2})/);
            const lbl = m ? new Date(+m[1], +m[2]-1, +m[3])
                                .toLocaleDateString(undefined, {month:'short', day:'numeric'})
                          : task.wait;
            pairs.push({ key: 'wait', text: `wait:${lbl}` });
        }

        // Unknown UDAs
        for (const [k, v] of Object.entries(task)) {
            if (CORE.has(k)) continue;
            if (v === null || v === undefined || v === '') continue;
            const fmt = Array.isArray(v) ? v.map(x => this._fmtVal(x)).join(',') : this._fmtVal(v);
            pairs.push({ key: k, text: `${k}:${fmt}` });
        }

        pairs.sort((a, b) => a.key.localeCompare(b.key));

        const parts = [];
        if (task.id) parts.push(`id:${task.id}`);
        pairs.forEach(p => parts.push(p.text));

        return parts.join(', ');
    }

    _fmtVal(v) {
        const s = String(v);
        // TW date: 20260425T120000Z
        const dm = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
        if (dm) {
            const d = new Date(Date.UTC(+dm[1],+dm[2]-1,+dm[3],+dm[4],+dm[5],+dm[6]));
            const yr = d.getFullYear() !== new Date().getFullYear() ? {year:'numeric'} : {};
            return d.toLocaleDateString(undefined, {month:'short', day:'numeric', ...yr});
        }
        // UUID: truncate to first 8 chars
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))
            return s.slice(0, 8);
        return s;
    }

    _due(due) {
        if (!due) return '';
        const m = due.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
        if (!m) return '';
        const d    = new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]));
        const days = (d - Date.now()) / 86400000;
        const cls  = days < 0 ? 'overdue' : days < 3 ? 'due-soon' : '';
        const lbl  = d.toLocaleDateString(undefined, {month:'short', day:'numeric'});
        return `<span class="card-due ${cls}">${lbl}</span>`;
    }

    _sched(scheduled) {
        if (!scheduled) return '';
        const m = scheduled.match(/^(\d{4})(\d{2})(\d{2})/);
        if (!m) return '';
        const lbl = new Date(+m[1], +m[2]-1, +m[3]).toLocaleDateString(undefined, {month:'short', day:'numeric'});
        return `<span class="card-sched">${lbl}</span>`;
    }

    _parseDur(s) {
        if (!s) return 0;
        if (s.startsWith('PT')) {
            const m = s.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
            return m ? (+m[1]||0)*60 + (+m[2]||0) : 0;
        }
        const m = s.match(/(?:(\d+)h)?(?:(\d+)min)?/);
        return m ? (+m[1]||0)*60 + (+m[2]||0) : 0;
    }

    _fmtDur(mins) {
        if (!mins) return '';
        const h = Math.floor(mins/60), m = mins%60;
        return h && m ? `${h}h${m}m` : h ? `${h}h` : `${m}m`;
    }

    _e(t) {
        const d = document.createElement('div');
        d.textContent = String(t ?? '');
        return d.innerHTML;
    }
}


