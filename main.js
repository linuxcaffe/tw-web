// tw-web — frontend JavaScript

// The nav filter and the sort are shared with the other views: TW.filter, TW.sort (tw-filter.js)

class TaskWarriorUI {
    constructor() {
        this.tasks = [];
        this.serverTotal = null;
        this.currentEditingTask = null;
        // The page's one TaskEditor is built on DOMContentLoaded (global `taskEditor`, below).

        this.viewMode      = localStorage.getItem('tw-view-mode')       || 'card';
        this.sortField     = localStorage.getItem('tw-sort-field')     || 'urgency';
        this.sortReverse   = localStorage.getItem('tw-sort-reverse')   === 'true';
        this.sortFieldNP   = localStorage.getItem('tw-sort-field-np')  || 'end';
        this.sortReverseNP = localStorage.getItem('tw-sort-reverse-np') !== 'false'; // default true

        // Wait for components to initialise before loading data
        setTimeout(() => {
            this.initializeEventListeners();
            this.loadTasks();
        }, 100);

        // Re-fetch on server-relevant changes; re-filter only for project/tags
        document.addEventListener('tw-filter-change', (e) => {
            // Rebuild sort popup field list when status changes (pending ↔ non-pending)
            this.updateSortBtn();
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

    static get SORT_FIELDS_PENDING() {
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

    static get SORT_FIELDS_NP() {
        return [
            { value: 'end',         label: 'End date (default)' },
            { value: 'description', label: 'Description' },
            { value: 'project',     label: 'Project' },
            { value: 'entry',       label: 'Created' },
            { value: 'modified',    label: 'Modified' },
            { value: 'priority',    label: 'Priority' },
            { value: 'tags',        label: 'Tags' },
        ];
    }

    // true when the current status view is completed or deleted
    isNonPending() {
        const state    = window.twNav ? window.twNav.getState() : {};
        const statuses = state.statuses || ['pending'];
        return statuses.length > 0 && statuses.every(s => s !== 'pending');
    }

    get activeSortField()   { return this.isNonPending() ? this.sortFieldNP   : this.sortField;   }
    get activeSortReverse() { return this.isNonPending() ? this.sortReverseNP : this.sortReverse; }

    sortTasks(tasks) {
        return TW.sort.tasks(tasks, this.activeSortField, this.activeSortReverse);
    }

    updateSortBtn() {
        const btn = document.getElementById('sort-btn');
        if (!btn) return;
        const np        = this.isNonPending();
        const field     = this.activeSortField;
        const reversed  = this.activeSortReverse;
        const isDefault = np ? (field === 'end' && reversed) : (field === 'urgency' && !reversed);
        btn.classList.toggle('sort-active', !isDefault);
        const fields = np ? TaskWarriorUI.SORT_FIELDS_NP : TaskWarriorUI.SORT_FIELDS_PENDING;
        const label  = fields.find(f => f.value === field)?.label || field;
        btn.title = isDefault ? 'Sort' : `Sort: ${label}${reversed ? ' ↑' : ' ↓'}`;
    }

    rebuildSortPopup() {
        const fields = document.getElementById('sort-fields');
        const revBox = document.getElementById('sort-reverse');
        if (!fields || !revBox) return;
        const np      = this.isNonPending();
        const flist   = np ? TaskWarriorUI.SORT_FIELDS_NP : TaskWarriorUI.SORT_FIELDS_PENDING;
        const current = this.activeSortField;
        fields.innerHTML = flist.map(f =>
            `<label><input type="radio" name="tw-sort" value="${f.value}"${f.value === current ? ' checked' : ''}> ${f.label}</label>`
        ).join('');
        revBox.checked = this.activeSortReverse;
    }

    initSortPopup() {
        const btn     = document.getElementById('sort-btn');
        const popup   = document.getElementById('sort-popup');
        const fields  = document.getElementById('sort-fields');
        const revBox  = document.getElementById('sort-reverse');
        if (!btn || !popup || !fields || !revBox) return;

        this.rebuildSortPopup();

        // Toggle popup — rebuild field list each open so it matches current status
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const opening = popup.style.display === 'none';
            if (opening) this.rebuildSortPopup();
            popup.style.display = opening ? 'block' : 'none';
        });

        // Field change
        fields.addEventListener('change', (e) => {
            if (e.target.name !== 'tw-sort') return;
            if (this.isNonPending()) {
                this.sortFieldNP = e.target.value;
                localStorage.setItem('tw-sort-field-np', this.sortFieldNP);
            } else {
                this.sortField = e.target.value;
                localStorage.setItem('tw-sort-field', this.sortField);
            }
            this.updateSortBtn();
            this.renderTasks();
        });

        // Reverse toggle
        revBox.addEventListener('change', () => {
            if (this.isNonPending()) {
                this.sortReverseNP = revBox.checked;
                localStorage.setItem('tw-sort-reverse-np', this.sortReverseNP);
            } else {
                this.sortReverse = revBox.checked;
                localStorage.setItem('tw-sort-reverse', this.sortReverse);
            }
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
                if (e.target.closest('.ann-link')) return;
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
            const needTotal    = true;

            // Serve from cache when fresh (every write empties it: TW.api.write)
            const c = TW.store.read('tasks', c => c.params === params);
            if (c) {
                this.tasks         = c.tasks;
                window._twAllTasks = this.tasks;
                this.serverTotal   = c.serverTotal;
                this.renderTasks();
                this.showLoading(false);
                return;
            }

            // When a context is active, also fetch the unfiltered status total so the
            // denominator in filtered/total reflects all tasks in this status.
            const fetches = [
                fetch('/api/tasks?' + params).then(r => r.json()),
                needTotal ? fetch('/api/tasks?' + statusParams).then(r => r.json()) : Promise.resolve(null),
            ];
            const [tasksData, totalData] = await Promise.all(fetches);

            if (tasksData.success) {
                this.tasks          = tasksData.tasks;
                window._twAllTasks  = this.tasks;
                this.serverTotal = totalData && totalData.success ? totalData.tasks.length : this.tasks.length;
                window.twNav?.setGrandTotal(this.serverTotal, params);
                TW.store.save('tasks', { params, tasks: this.tasks, serverTotal: this.serverTotal });
                this.renderTasks();
                if (tasksData.warnings && tasksData.warnings.length > 0) {
                    this.showNotification(tasksData.warnings.join(' | '), 'warning');
                }
            } else {
                this.showError(tasksData.error || 'Failed to load tasks');
            }

        } catch (error) {
            this.showError('Network error: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }
    
    // After a save (add or edit)
    handleTaskSaveSuccess(task, isEdit) {
        if (isEdit) {
            // Update the task in the local list
            const taskIndex = this.tasks.findIndex(t => t.uuid === task.uuid);
            if (taskIndex !== -1) {
                this.tasks[taskIndex] = task;
            }
        } else {
            // Put the new task first
            this.tasks.unshift(task);
        }
        this.renderTasks();
        this.showNotification(isEdit ? 'Task updated successfully' : 'Task added successfully', 'success');
    }
    
    // Editor cancelled
    handleTaskCancel() {
        this.currentEditingTask = null;
    }
    


    // Filter tasks client-side using the nav state (TW.filter)
    getFilteredTasks() {
        return TW.filter.navTasks(this.tasks);
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
        
        // Empty the container
        container.innerHTML = '';
        
        const allLookup = new Map((window._twAllTasks || []).map(t => [t.uuid, t]));
        filteredTasks.forEach(task => taskCardManager.appendWithDeps(container, task, allLookup));
    }


    /**
     * Remove one task card from the DOM without reloading the list
     */
    removeTaskCard(taskUuid) {
        const taskCard = document.querySelector(`.task-card[data-task-id="${taskUuid}"]`);
        if (taskCard) {
            taskCard.remove();

            // Show "No tasks found" if that was the last card
            const container = document.getElementById('tasks-container');
            if (container && container.querySelectorAll('.task-card').length === 0) {
                container.innerHTML = '<div class="no-tasks">No tasks found</div>';
            }
        }
    }

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
    // The List's card manager, with the List's action handler
    taskCardManager = new TaskCardManager(new ScriptTaskActionHandler());
    
    // ?add=1 — open the Add dialog on load (e.g. from Firefox extension shortcut)
    if (new URLSearchParams(window.location.search).get('add') === '1') {
        history.replaceState({}, '', '/');
        setTimeout(() => document.dispatchEvent(new CustomEvent('tw-open-add')), 300);
    }

    // The List's editor (a global, as on the other pages)
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
