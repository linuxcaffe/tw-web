// tw-web — frontend JavaScript

// Attribute-modifier filter helpers
// Recognised modifiers for text/ordered fields
const _TEXT_MODS = new Set(['is','isnt','not','contains','startswith','endswith','any','none']);
const _ORD_MODS  = new Set(['is','isnt','any','none']);
// Explicit priority order for < / > comparisons
const _PRI_ORDER = ['1','2','3','4','5','6','H','M','L'];

// Parse a leading modifier prefix from input: ".mod:val" → {mod, val}
// or "< val" / "> val" → {mod:'lt'/'gt', val}. Returns null if no prefix.
function _parseModifier(input) {
    const m = input.match(/^\.([a-z]+):(.*)/i);
    if (m) return { mod: m[1].toLowerCase(), val: m[2] };
    const c = input.match(/^([<>])\s+(.*)/);
    if (c) return { mod: c[1] === '<' ? 'lt' : 'gt', val: c[2] };
    return null;
}

// Compare a scalar field value against a filter string, with optional modifier.
// type: 'text' (case-insensitive string ops) | 'ord' (priority order for </> )
function _matchAttr(fieldVal, input, type) {
    const p = _parseModifier(input);
    const fv = String(fieldVal);

    if (!p) {
        // default: contains (text) or is (ord)
        return type === 'ord'
            ? fv.toLowerCase() === input.toLowerCase()
            : fv.toLowerCase().includes(input.toLowerCase());
    }

    const { mod, val } = p;
    const fvl = fv.toLowerCase();
    const vl  = val.toLowerCase();

    if (mod === 'lt' || mod === 'gt') {
        const ai = _PRI_ORDER.indexOf(fv.toUpperCase());
        const bi = _PRI_ORDER.indexOf(val.toUpperCase());
        if (ai === -1 || bi === -1) {
            // fall back to numeric if both parse as numbers
            const an = parseFloat(fv), bn = parseFloat(val);
            if (isNaN(an) || isNaN(bn)) return false;
            return mod === 'lt' ? an < bn : an > bn;
        }
        return mod === 'lt' ? ai < bi : ai > bi;
    }

    const allowed = type === 'ord' ? _ORD_MODS : _TEXT_MODS;
    if (!allowed.has(mod)) return false;  // unrecognised modifier → no match

    switch (mod) {
        case 'any':        return fv !== '';
        case 'none':       return fv === '';
        case 'is':         return fvl === vl;
        case 'isnt':
        case 'not':        return fvl !== vl;
        case 'contains':   return fvl.includes(vl);
        case 'startswith': return fvl.startsWith(vl);
        case 'endswith':   return fvl.endsWith(vl);
        default:           return false;
    }
}

// Match a task's tags array against a tags filter string.
// Supports modifier prefixes: .has: .hasnt: .any: .none:
// Without prefix, comma-separated values must ALL be present (AND).
function _matchTags(taskTags, input) {
    const p = _parseModifier(input);

    if (!p) {
        // default: all comma-separated tags must be present
        const wanted = input.split(',').map(t => t.trim()).filter(Boolean);
        return wanted.length === 0 || wanted.every(t => taskTags.includes(t));
    }

    const { mod, val } = p;
    switch (mod) {
        case 'has':    return taskTags.includes(val);
        case 'hasnt':  return !taskTags.includes(val);
        case 'any':    return taskTags.length > 0;
        case 'none':   return taskTags.length === 0;
        default:       return false;
    }
}

class TaskWarriorUI {
    constructor() {
        this.tasks = [];
        this.serverTotal = null;
        this.currentEditingTask = null;
        this.projects = new Set();
        
        // Initialiser le composant TaskEditor
        this.taskEditor = new TaskEditor({
            showAllFields: true,
            priorityFormat: 'letters',
            language: 'en',
            modalId: 'unified-task-editor',
            onSave: (taskData, isEdit) => this.handleTaskSave(taskData, isEdit),
            onCancel: () => this.handleTaskCancel()
        });
        
        this.viewMode    = localStorage.getItem('tw-view-mode')    || 'card';
        this.sortField   = localStorage.getItem('tw-sort-field')   || 'urgency';
        this.sortReverse = localStorage.getItem('tw-sort-reverse') === 'true';

        // Wait for components to initialise before loading data
        setTimeout(() => {
            this.initializeEventListeners();
            this.loadTasks();
            this.updateProjectSuggestions();
        }, 100);

        // Re-fetch on server-relevant changes; re-filter only for project/tags
        document.addEventListener('tw-filter-change', (e) => {
            if (e.detail && e.detail.clientOnly) {
                this.renderTasks();
            } else {
                this.loadTasks();
            }
        });

        // Add button (nav) → open TaskEditor as a dialog
        document.addEventListener('tw-open-add', () => {
            if (typeof taskEditor !== 'undefined') taskEditor.show();
        });

        // nav.js refresh button → show notification
        document.addEventListener('tw-show-notification', (e) => {
            const { message, type } = e.detail || {};
            if (message) this.showNotification(message, type || 'success');
        });

        // Sync complete (fired by nav.js after a successful sync or undo)
        document.addEventListener('tw-sync-complete', () => {
            this.loadTasks();
            window.twPollSyncStatus?.();
        });

    }

    // ── Sort ─────────────────────────────────────────────────────────────────

    static get SORT_FIELDS() {
        return [
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
    }

    sortTasks(tasks) {
        const field = this.sortField;
        const rev   = this.sortReverse ? -1 : 1;
        if (field === 'urgency') return rev === 1 ? tasks : [...tasks].reverse();

        const PRI = { H: 3, M: 2, L: 1 };
        return [...tasks].sort((a, b) => {
            let av = a[field], bv = b[field];
            if (field === 'priority') { av = PRI[av] || 0; bv = PRI[bv] || 0; }
            else if (field === 'tags') { av = (av || []).join(','); bv = (bv || []).join(','); }
            // Dates come as ISO strings — sort as strings (lexicographic = chronological)
            av = av ?? '';
            bv = bv ?? '';
            if (av < bv) return -1 * rev;
            if (av > bv) return  1 * rev;
            return 0;
        });
    }

    updateSortBtn() {
        const btn = document.getElementById('sort-btn');
        if (!btn) return;
        const isDefault = this.sortField === 'urgency' && !this.sortReverse;
        btn.classList.toggle('sort-active', !isDefault);
        const label = TaskWarriorUI.SORT_FIELDS.find(f => f.value === this.sortField)?.label || this.sortField;
        btn.title = isDefault ? 'Sort' : `Sort: ${label}${this.sortReverse ? ' ↑' : ' ↓'}`;
    }

    initSortPopup() {
        const btn     = document.getElementById('sort-btn');
        const popup   = document.getElementById('sort-popup');
        const fields  = document.getElementById('sort-fields');
        const revBox  = document.getElementById('sort-reverse');
        if (!btn || !popup || !fields || !revBox) return;

        // Build radio list
        fields.innerHTML = TaskWarriorUI.SORT_FIELDS.map(f =>
            `<label><input type="radio" name="tw-sort" value="${f.value}"${f.value === this.sortField ? ' checked' : ''}> ${f.label}</label>`
        ).join('');
        revBox.checked = this.sortReverse;

        // Toggle popup
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
        });

        // Field change
        fields.addEventListener('change', (e) => {
            if (e.target.name === 'tw-sort') {
                this.sortField = e.target.value;
                localStorage.setItem('tw-sort-field', this.sortField);
                this.updateSortBtn();
                this.renderTasks();
            }
        });

        // Reverse toggle
        revBox.addEventListener('change', () => {
            this.sortReverse = revBox.checked;
            localStorage.setItem('tw-sort-reverse', this.sortReverse);
            this.updateSortBtn();
            this.renderTasks();
        });

        // Close on outside click
        document.addEventListener('click', () => { popup.style.display = 'none'; });
        popup.addEventListener('click', (e) => e.stopPropagation());

        this.updateSortBtn();
    }

    initializeEventListeners() {
        const cardBtn = document.getElementById('view-card');
        const listBtn = document.getElementById('view-list');
        if (cardBtn && listBtn) {
            const setView = (mode) => {
                this.viewMode = mode;
                localStorage.setItem('tw-view-mode', mode);
                cardBtn.classList.toggle('active', mode === 'card');
                listBtn.classList.toggle('active', mode === 'list');
                const tc = document.getElementById('tasks-container');
                tc.classList.toggle('list-view', mode === 'list');
                if (mode === 'list') {
                    tc.querySelectorAll('.task-card.expanded').forEach(c => c.classList.remove('expanded'));
                    tc.querySelectorAll('.task-card.collapsed').forEach(c => c.classList.remove('collapsed'));
                }
            };
            setView(this.viewMode);
            cardBtn.addEventListener('click', () => setView('card'));
            listBtn.addEventListener('click', () => setView('list'));
        }
        this.initSortPopup();

        // Single-click anywhere on a card (not an action button) to expand/collapse
        const container = document.getElementById('tasks-container');
        if (container) {
            container.addEventListener('click', (e) => {
                if (e.target.closest('[data-task-action]')) return;
                const card = e.target.closest('.task-card');
                if (!card) return;
                if (this.viewMode === 'list') {
                    card.classList.toggle('expanded');
                } else {
                    card.classList.toggle('collapsed');
                }
            });
        }
    }



    async loadTasks() {
        try {
            this.showLoading(true);
            this.hideError();

            const state        = window.twNav ? window.twNav.getState() : {};
            const params       = window.twNav ? window.twNav.stateToParams() : 'status=pending';
            const statusParams = new URLSearchParams();
            statusParams.set('status', (state.statuses || ['pending']).join(','));
            const needTotal    = !!(state.context);
            const cacheKey     = 'tw-tasks-cache';
            const dirtyKey     = 'tw-tasks-dirty';

            // Serve from cache when clean and fresh
            const dirty = sessionStorage.getItem(dirtyKey) === '1';
            if (!dirty) {
                try {
                    const c = JSON.parse(sessionStorage.getItem(cacheKey));
                    if (c && c.params === params && (Date.now() - c.ts) < 30_000) {
                        this.tasks       = c.tasks;
                        this.serverTotal = c.serverTotal;
                        this.renderTasks();
                        this.showLoading(false);
                        return;
                    }
                } catch {}
            }

            // When a context is active, also fetch the unfiltered status total so the
            // denominator in filtered/total reflects all tasks in this status.
            const fetches = [
                fetch('/api/tasks?' + params).then(r => r.json()),
                needTotal ? fetch('/api/tasks?' + statusParams).then(r => r.json()) : Promise.resolve(null),
                fetch('/api/projects').then(r => r.json()),
            ];
            const [tasksData, totalData, projectsData] = await Promise.all(fetches);

            if (tasksData.success) {
                this.tasks       = tasksData.tasks;
                this.serverTotal = totalData && totalData.success ? totalData.tasks.length : this.tasks.length;
                window.twNav?.setGrandTotal(this.serverTotal, params);
                try {
                    sessionStorage.setItem(cacheKey, JSON.stringify(
                        { params, tasks: this.tasks, serverTotal: this.serverTotal, ts: Date.now() }
                    ));
                    sessionStorage.removeItem(dirtyKey);
                } catch {}
                this.renderTasks();
                if (tasksData.warnings && tasksData.warnings.length > 0) {
                    this.showNotification(tasksData.warnings.join(' | '), 'warning');
                }
            } else {
                this.showError(tasksData.error || 'Failed to load tasks');
            }

            if (projectsData.success) {
                this.updateProjectDatalist(projectsData.projects);
                // Mettre à jour aussi les suggestions du TaskCreator
                if (this.taskCreator) {
                    this.taskCreator.updateProjectSuggestions(projectsData.projects);
                }
            }
        } catch (error) {
            this.showError('Network error: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }
    
    // Update the project datalist with all available projects
    updateProjectDatalist(projects) {
        const datalist = document.getElementById('project-options');
        if (!datalist) return;
        
        // Clear existing options
        datalist.innerHTML = '';
        
        // Add projects to datalist
        projects.forEach(project => {
            if (project) {  // Only add non-empty projects
                const option = document.createElement('option');
                option.value = project;
                datalist.appendChild(option);
            }
        });
    }


    // Gestionnaire unifié pour la sauvegarde des tâches (ajout et modification)
    handleTaskSaveSuccess(task, isEdit) {
        if (isEdit) {
            // Mettre à jour la tâche dans le tableau local
            const taskIndex = this.tasks.findIndex(t => t.uuid === task.uuid);
            if (taskIndex !== -1) {
                this.tasks[taskIndex] = task;
            }
        } else {
            // Ajouter la nouvelle tâche au début de la liste
            this.tasks.unshift(task);
        }
        this.renderTasks();
        this.showNotification(isEdit ? 'Task updated successfully' : 'Task added successfully', 'success');
    }
    
    // Gestionnaire pour l'annulation
    handleTaskCancel() {
        this.currentEditingTask = null;
    }
    


    // Filter tasks client-side using project/tags from nav state
    getFilteredTasks() {
        const state = window.twNav ? window.twNav.getState() : {};
        const filter   = (state.filter   || '').trim();
        const priority = (state.priority || '').trim();
        const project  = (state.project  || '').trim();
        const tags     = (state.tags     || '').trim();

        return this.tasks.filter(task => {
            if (filter   && !_matchAttr(task.description || '', filter,  'text'))  return false;
            if (priority && !_matchAttr(task.priority    || '', priority, 'ord'))   return false;
            if (project  && !_matchAttr(task.project     || '', project,  'text'))  return false;
            if (tags     && !_matchTags(task.tags        || [], tags))              return false;
            return true;
        });
    }

    updateProjectsList() {
        this.projects.clear();
        this.tasks.forEach(task => {
            if (task.project) {
                this.projects.add(task.project);
            }
        });
        this.updateProjectSuggestions();
    }
    
    updateProjectSuggestions(filter = '') {
        const datalist = document.getElementById('project-suggestions');
        if (!datalist) return;
        
        // Clear existing options
        datalist.innerHTML = '';
        
        // Filter and sort projects
        const filteredProjects = Array.from(this.projects)
            .filter(project => 
                project.toLowerCase().includes(filter.toLowerCase())
            )
            .sort();
        
        // Add filtered projects to datalist
        filteredProjects.forEach(project => {
            const option = document.createElement('option');
            option.value = project;
            datalist.appendChild(option);
        });
    }

    renderTasks() {
        const container = document.getElementById('tasks-container');
        if (!container) return;

        const filteredTasks = this.sortTasks(this.getFilteredTasks());

        // Dynamic heading: "N <Status> Tasks" — N is filtered count
        const heading = document.getElementById('tasks-heading');
        if (heading) {
            const state = window.twNav ? window.twNav.getState() : { statuses: ['pending'] };
            const status = state.statuses[0] || 'pending';
            const label = status.charAt(0).toUpperCase() + status.slice(1);
            heading.textContent = `${filteredTasks.length} ${label} Tasks`;
        }

        // Update projects list whenever tasks are rendered
        this.updateProjectsList();

        if (window.twNav) window.twNav.setCount(filteredTasks.length, this.serverTotal != null ? this.serverTotal : this.tasks.length);
        document.dispatchEvent(new CustomEvent('tw-tasks-loaded', { detail: { tasks: filteredTasks } }));

        // Filter badge: show active text filter
        const badge = document.getElementById('filter-badge');
        if (badge) {
            const f = window.twNav ? window.twNav.getState().filter : '';
            badge.textContent = f ? `"${f}"` : '';
            badge.classList.toggle('visible', !!f);
        }

        // Preserve view mode class on re-render
        const tc = document.getElementById('tasks-container');
        if (tc && this.viewMode === 'list') tc.classList.add('list-view');

        if (filteredTasks.length === 0) {
            container.innerHTML = '<div class="no-tasks">No tasks found</div>';
            return;
        }
        
        // Vide le conteneur
        container.innerHTML = '';
        
        // Crée et ajoute chaque carte de tâche
        filteredTasks.forEach(task => {
            const taskCard = taskCardManager.createTaskCard(task);
            container.appendChild(taskCard);
        });
    }


    /**
     * Supprime une taskCard spécifique du DOM sans recharger toutes les tâches
     */
    removeTaskCard(taskUuid) {
        const taskCard = document.querySelector(`.task-card[data-task-id="${taskUuid}"]`);
        if (taskCard) {
            taskCard.remove();

            // Mettre à jour le message "aucune tâche" si nécessaire
            const container = document.getElementById('tasks-container');
            if (container && container.querySelectorAll('.task-card').length === 0) {
                container.innerHTML = '<div class="no-tasks">No tasks found</div>';
            }
        }
    }

    // Cette méthode n'est plus nécessaire car TaskEditor gère son propre nettoyage

    showLoading(show) {
        const loading = document.getElementById('loading');
        loading.style.display = show ? 'block' : 'none';
    }

    showError(message) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    hideError() {
        document.getElementById('error-message').style.display = 'none';
    }

    showNotification(message, type = 'success') {
        document.dispatchEvent(new CustomEvent('tw-show-notification',
            { detail: { message, type } }));
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}


// Initialize the app when the page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new TaskWarriorUI();
    window.twNav?.initProjectsSidebar(document.getElementById('tw-proj-sidebar'));
    window.twNav?.initTagsSidebar(document.getElementById('tw-tags-sidebar'));
    // Initialiser taskCardManager avec le gestionnaire d'actions spécifique à main.js
    taskCardManager = new TaskCardManager(new ScriptTaskActionHandler());
    
    // Initialiser taskEditor comme variable globale
    taskEditor = new TaskEditor({
        showAllFields: true,
        priorityFormat: 'letters',
        language: 'en',
        modalId: 'unified-task-editor',
        onSaveSuccess: (task, isEdit) => app.handleTaskSaveSuccess(task, isEdit),
        onLogSuccess: () => app.showNotification('Task logged', 'success'),
        onSaveError: (error) => app.showNotification(error, 'error'),
        onCancel: () => app.handleTaskCancel()
    });
});
