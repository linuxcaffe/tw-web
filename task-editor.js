/**
 * Composant réutilisable pour l'édition de tâches
 * Unifie les formulaires entre index.html et day-planner.html
 */

class TaskEditor {
    constructor(options = {}) {
        this.options = {
            // Configuration par défaut
            showAllFields: true,
            priorityFormat: 'letters', // 'letters' (H/M/L) ou 'words' (high/medium/low)
            language: 'en', // 'en' or 'fr'
            modalId: 'task-editor-modal',
            inline: false, // Mode inline ou modal
            containerId: null, // ID du conteneur pour le mode inline
            ...options
        };
        
        this.currentTask = null;
        this.template = null;
        this.onSave = options.onSave || (() => {});
        this.onCancel = options.onCancel || (() => {});
        this.onSaveSuccess = options.onSaveSuccess || (() => {});
        this.onSaveError = options.onSaveError || (() => {});
        this.onLogSuccess = options.onLogSuccess || (() => {});
        
        this.init();
    }
    
    init() {
        if (this.options.inline) {
            this.createInlineContainer();
        } else {
            this.createModal();
            this.bindEvents();
        }
    }
    
    createModal() {
        // Supprimer le modal existant s'il existe
        const existingModal = document.getElementById(this.options.modalId);
        if (existingModal) {
            existingModal.remove();
        }
        
        const modal = document.createElement('div');
        modal.id = this.options.modalId;
        modal.className = 'modal task-editor-modal';
        
        document.body.appendChild(modal);
        this.modal = modal;
        
        // Charger et appliquer le template
        this.loadTemplate().then(() => {
            if (this.template) {
                this.renderModal();
            }
        });
    }
    
    createInlineContainer() {
        const container = document.getElementById(this.options.containerId);
        if (!container) {
            console.error(`Container with id "${this.options.containerId}" not found`);
            return;
        }
        
        // Charger et appliquer le template
        this.loadTemplate().then(() => {
            if (this.template) {
                container.innerHTML = '';
                const templateContent = this.template.content.cloneNode(true);
                container.appendChild(templateContent);
                this.modal = container.querySelector('.modal-content');
                this.populateTemplate();
                this.bindEvents();
            }
        });
    }
    
    async loadTemplate() {
        try {
            const response = await fetch('task-editor-templates.html');
            const html = await response.text();
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            this.template = tempDiv.querySelector('#task-editor-modal');
            if (!this.template) {
                console.error('Template task-editor-modal non trouvé');
                return;
            }
            
            document.body.appendChild(this.template);
        } catch (error) {
            console.error('Erreur lors du chargement du template:', error);
        }
    }
    
    renderModal() {
        if (!this.template) return;
        
        const templateContent = this.template.content.cloneNode(true);
        this.modal.appendChild(templateContent);
        
        // Remplir les slots avec les textes appropriés
        this.populateTemplate();
        
        // Re-lier les événements après le rendu
        this.bindEvents();
    }
    
    populateTemplate() {
        const texts = this.getTexts();
        const priorityOptions = this.getPriorityOptions();
        
        // Remplir les slots de texte
        const slots = {
            'title': texts.addTask,
            'description-label': texts.description,
            'tags-label': texts.tags,
            'tags-placeholder': texts.tagsPlaceholder,
            'project-label': texts.project,
            'project-placeholder': texts.projectPlaceholder,
            'priority-label': texts.priority,
            'no-priority': texts.noPriority,
            'duration-label': texts.duration,
            'duration-placeholder': texts.durationPlaceholder,
            'due-label': texts.dueDate,
            'scheduled-label': texts.scheduled,
            'save-button': texts.save,
            'cancel-button': texts.cancel
        };
        
        // Remplir les slots
        Object.entries(slots).forEach(([name, value]) => {
            const slot = this.modal.querySelector(`slot[name="${name}"]`);
            if (slot) {
                slot.textContent = value;
            }
        });
        
        // Priority is now a plain text input — no options to populate
        
        // Gérer l'affichage des champs étendus
        this.toggleExtendedFields(this.options.showAllFields);
    }
    
    toggleExtendedFields(show) {
        const extendedFields = this.modal.querySelector('.extended-fields');
        const extendedDates = this.modal.querySelector('.extended-dates');
        
        if (extendedFields) extendedFields.style.display = show ? 'block' : 'none';
        if (extendedDates) extendedDates.style.display = show ? 'block' : 'none';
    }
    
    getTexts() {
        if (this.options.language === 'fr') {
            return {
                addTask: 'Ajouter une tâche',
                editTask: 'Modifier la tâche',
                description: 'Description',
                tags: 'Tags',
                tagsPlaceholder: 'Tags séparés par des virgules',
                project: 'Projet',
                projectPlaceholder: 'Nom du projet',
                priority: 'Priorité',
                noPriority: 'Aucune',
                duration: 'Durée',
                durationPlaceholder: 'ex: 30min, 1h30m, 2d',
                dueDate: 'Date d\'échéance',
                scheduled: 'Planifié',
                save: 'Sauvegarder',
                cancel: 'Annuler'
            };
        } else {
            return {
                addTask: 'Add Task',
                editTask: 'Edit Task',
                description: 'Description',
                tags: 'Tags',
                tagsPlaceholder: 'Comma-separated tags',
                project: 'Project',
                projectPlaceholder: 'Project name',
                priority: 'Priority',
                noPriority: 'None',
                duration: 'Duration',
                durationPlaceholder: 'e.g., 30min, 1h30m, 2d',
                dueDate: 'Due Date',
                scheduled: 'Scheduled',
                save: 'Save Changes',
                cancel: 'Cancel'
            };
        }
    }
    
    getPriorityOptions() {
        if (this.options.priorityFormat === 'letters') {
            return [
                { value: 'H', label: this.options.language === 'fr' ? 'Élevée' : 'High' },
                { value: 'M', label: this.options.language === 'fr' ? 'Moyenne' : 'Medium' },
                { value: 'L', label: this.options.language === 'fr' ? 'Faible' : 'Low' }
            ];
        } else {
            return [
                { value: 'high', label: this.options.language === 'fr' ? 'Élevée' : 'High' },
                { value: 'medium', label: this.options.language === 'fr' ? 'Moyenne' : 'Medium' },
                { value: 'low', label: this.options.language === 'fr' ? 'Faible' : 'Low' }
            ];
        }
    }
    
    bindEvents() {
        // Vérifier que les éléments existent avant d'ajouter les événements
        const closeBtn = this.modal.querySelector('.task-editor-close');
        const cancelBtn = this.modal.querySelector('#task-editor-cancel');
        const form = this.modal.querySelector('#task-editor-form');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hide();
            });
        }
        
        // Fermeture en cliquant à l'extérieur
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.hide();
                this.onCancel();
            });
        }

        const logBtn = this.modal.querySelector('#task-editor-log');
        if (logBtn) {
            logBtn.addEventListener('click', () => this.handleLog());
        }
        
        // Auto-uppercase h→H, m→M, l→L in priority field (leaves numeric values untouched)
        const priField = this.modal.querySelector('#task-editor-priority');
        if (priField) {
            priField.addEventListener('input', () => {
                const v = priField.value;
                const up = v.replace(/[hml]/g, c => c.toUpperCase());
                if (up !== v) { priField.value = up; }
            });
        }

        // Datetime-local: dim the format-hint text when the field is empty
        const syncDtColor = (inp) => inp.classList.toggle('te-dt-empty', !inp.value);
        this.modal.querySelectorAll('input[type="datetime-local"]').forEach(inp => {
            inp.addEventListener('change', () => syncDtColor(inp));
            syncDtColor(inp);
        });

        // Date field clear buttons — type-switch trick: WebKit ignores .value='' on
        // datetime-local but respects it when type is temporarily 'text'.
        this.modal.querySelectorAll('.te-clr').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const target = this.modal.querySelector('#' + btn.dataset.clears);
                if (!target) return;
                target.type  = 'text';
                target.value = '';
                target.type  = 'datetime-local';
                target.dispatchEvent(new Event('change', { bubbles: true }));
            });
        });

        // Populate state dropdown from kanban columns
        this._loadStateOptions();

        // Save button (type=button to prevent native datetime-local validation/focus)
        const saveBtn = this.modal.querySelector('#task-editor-save');
        if (saveBtn) saveBtn.addEventListener('click', () => this.handleSave());

        // Keep form submit as fallback for Enter key
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSave();
            });
        }
        
        // Échap pour fermer
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'block') {
                this.hide();
            }
        });
    }
    
    show(task = null) {
        this.currentTask = task;

        // Assurer que le modal et le template sont chargés
        if (!this.modal || !this.template) {
            if (this.options.inline) {
                this.createInlineContainer();
            } else {
                this.createModal();
            }
            return;
        }

        const title = this.modal.querySelector('#task-editor-title');
        const texts = this.getTexts();

        if (task) {
            if (title) title.textContent = texts.editTask;
            this.populateForm(task);
        } else {
            if (title) title.textContent = texts.addTask;
            this.clearForm();
        }

        // Log button only makes sense for new tasks
        const logBtn = this.modal.querySelector('#task-editor-log');
        if (logBtn) logBtn.style.display = task ? 'none' : '';

        this.modal.style.display = 'block';

        setTimeout(() => {
            const descField = this.modal.querySelector('#task-editor-description');
            if (descField) descField.focus();
        }, 80);
    }
    
    showForTask(task) {
        this.show(task);
    }
    
    hide() {
        if (this.options.inline) {
            this.clearForm();
        } else {
            this.modal.style.display = 'none';
        }
        this.currentTask = null;
    }
    
    async _loadStateOptions() {
        const sel = this.modal.querySelector('#task-editor-state');
        if (!sel) return;
        try {
            const d = await fetch('/api/kanban-columns').then(r => r.json());
            const cols = d.columns || [];
            const current = sel.dataset.current || '';
            sel.innerHTML = `<option value="">— state —</option>` +
                cols.map(c => `<option value="${c}"${c === current ? ' selected' : ''}>${c}</option>`).join('');
        } catch {}
    }

    populateForm(task) {
        const form = this.modal.querySelector('#task-editor-form');
        if (!form) return;
        
        // Champs de base
        const descField = form.querySelector('#task-editor-description');
        const priorityField = form.querySelector('#task-editor-priority');
        const durationField = form.querySelector('#task-editor-duration');
        
        if (descField) descField.value = task.description || '';
        if (priorityField) {
            // Convertir la priorité au format attendu par la liste déroulante
            const priorityValue = task.priority ?  task.priority : '';
            priorityField.value = priorityValue;
        }
        const dueDurField = form.querySelector('#task-editor-due-duration');
        if (durationField) durationField.value = '';   // legacy field — unused
        if (dueDurField) dueDurField.value = task.due_duration || '';
        
        // Champs étendus si disponibles
        if (this.options.showAllFields) {
            const tagsField = form.querySelector('#task-editor-tags');
            const projectField = form.querySelector('#task-editor-project');
            const dueField = form.querySelector('#task-editor-due');
            const scheduledField = form.querySelector('#task-editor-scheduled');
            
            if (tagsField) tagsField.value = Array.isArray(task.tags) ? task.tags.join(', ') : (task.tags || '');
            if (projectField) projectField.value = task.project || '';
            if (dueField) dueField.value = this.formatDateForInput(task.due);
            if (scheduledField) scheduledField.value = this.formatDateForInput(task.scheduled);

            const schedDurField = form.querySelector('#task-editor-sched-duration');
            if (schedDurField) schedDurField.value = task.sched_duration || '';

            const stateField = form.querySelector('#task-editor-state');
            if (stateField) {
                stateField.dataset.current = task.state || '';
                stateField.value = task.state || '';
            }

            const depsField = form.querySelector('#task-editor-deps');
            if (depsField) {
                const deps = task.depends
                    ? (Array.isArray(task.depends) ? task.depends : String(task.depends).split(',')).map(d => d.trim()).filter(Boolean)
                    : [];
                depsField.value = deps.join(', ');
            }

            const waitField  = form.querySelector('#task-editor-wait');
            const untilField = form.querySelector('#task-editor-until');
            if (waitField)  waitField.value  = this.formatDateForInput(task.wait);
            if (untilField) untilField.value = this.formatDateForInput(task.until);
        }

        // Sync datetime-local empty-state styling after programmatic fill
        this.modal.querySelectorAll('input[type="datetime-local"]').forEach(inp =>
            inp.classList.toggle('te-dt-empty', !inp.value)
        );

        // Show existing annotations with edit/delete controls
        this._renderAnnotations(Array.isArray(task.annotations) ? task.annotations : []);

        this._setupRevertBtn(task);
    }

    _setupRevertBtn(task) {
        const banner    = this.modal.querySelector('#te-status-banner');
        const statusTxt = this.modal.querySelector('#te-status-text');
        const revertBtn = this.modal.querySelector('#te-revert-btn');
        if (!banner) return;

        const status = task?.status;
        if (status && status !== 'pending') {
            if (statusTxt) statusTxt.textContent = `Status: ${status}`;
            banner.style.display = '';
            if (revertBtn) {
                revertBtn.onclick = async () => {
                    try {
                        const r = await fetch(`/api/task/${task.uuid}/revert`, { method: 'POST' });
                        const d = await r.json();
                        if (d.success) {
                            this.onSaveSuccess(d.task, true);
                            this.hide();
                        } else {
                            this.onSaveError(d.message || 'Failed to revert task');
                        }
                    } catch (e) {
                        this.onSaveError('Network error: ' + e.message);
                    }
                };
            }
        } else {
            banner.style.display = 'none';
        }
    }
    
    clearForm() {
        const form = this.modal.querySelector('#task-editor-form');
        if (form) form.reset();
        // Clear any leftover annotation state from a previous edit
        const annList = this.modal.querySelector('#te-existing-annotations');
        if (annList) annList.innerHTML = '';
        this._hideAnnEditor();
        // Hide status banner
        const banner = this.modal.querySelector('#te-status-banner');
        if (banner) banner.style.display = 'none';
        // Re-sync datetime styling
        this.modal.querySelectorAll('input[type="datetime-local"]').forEach(inp =>
            inp.classList.toggle('te-dt-empty', !inp.value)
        );
    }
    
    handleSave() {
        const form = this.modal.querySelector('#task-editor-form');
        if (!form) return;
        
        const taskData = {
            description: form.querySelector('#task-editor-description').value,
            priority:    form.querySelector('#task-editor-priority').value,
        };

        const tagsField     = form.querySelector('#task-editor-tags');
        const projectField  = form.querySelector('#task-editor-project');
        const dueField      = form.querySelector('#task-editor-due');
        const dueDurField   = form.querySelector('#task-editor-due-duration');
        const schedField    = form.querySelector('#task-editor-scheduled');
        const schedDurField = form.querySelector('#task-editor-sched-duration');
        const stateField    = form.querySelector('#task-editor-state');
        const depsField     = form.querySelector('#task-editor-deps');
        const waitField     = form.querySelector('#task-editor-wait');
        const untilField    = form.querySelector('#task-editor-until');

        if (tagsField) {
            const newTags = tagsField.value.split(',').map(t => t.trim()).filter(Boolean);
            if (this.currentTask) {
                // Edit: send diff so backend can do targeted +/- without -TAGS
                const existing = Array.isArray(this.currentTask.tags) ? this.currentTask.tags : [];
                taskData.tags_remove = existing.filter(t => !newTags.includes(t));
                taskData.tags_add    = newTags.filter(t => !existing.includes(t));
            } else {
                taskData.tags = newTags;
            }
        }
        if (projectField)  taskData.project        = projectField.value;
        if (dueField)      taskData.due            = dueField.value;
        if (dueDurField)   taskData.due_duration   = dueDurField.value;
        if (schedField)    taskData.scheduled      = schedField.value;
        if (schedDurField) taskData.sched_duration = schedDurField.value;
        if (stateField)    taskData.state          = stateField.value;
        if (depsField)     taskData.depends        = depsField.value.split(',').map(s => s.trim()).filter(Boolean).join(',');
        if (waitField)     taskData.wait           = waitField.value;
        if (untilField)    taskData.until          = untilField.value;
        
        // Ajouter l'ID si on modifie une tâche existante
        if (this.currentTask) {
            taskData.id = this.currentTask.id;
            taskData.uuid = this.currentTask.uuid;
        }
        
        // Appeler la nouvelle méthode de sauvegarde
        this.saveTask(taskData, this.currentTask !== null);
    }
    
    async saveTask(taskData, isEdit) {
        try {
            const taskDataForAPI = this.prepareTaskDataForAPI(taskData, isEdit);
            const endpoint = isEdit ? `/api/task/${taskData.uuid}/modify` : '/api/task/add';
            const method = isEdit ? 'PUT' : 'POST';
            
            const response = await fetch(endpoint, {
                method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(taskDataForAPI)
            });
            
            const data = await response.json();
            
            if (data.success) {
                if (data.deferred_cmd) window.twTerminal?.offerTerminal(data.deferred_cmd);
                this.onSaveSuccess(data.task, isEdit);
                this.hide();
            } else {
                this.onSaveError(data.error || data.message || (isEdit ? 'Failed to update task' : 'Failed to add task'));
            }
        } catch (error) {
            this.onSaveError('Network error: ' + error.message);
        }
    }

    handleLog() {
        const form = this.modal.querySelector('#task-editor-form');
        if (!form) return;

        const description = form.querySelector('#task-editor-description')?.value || '';
        if (!description) return;

        const taskData = { description, priority: form.querySelector('#task-editor-priority')?.value || '' };

        const tagsField     = form.querySelector('#task-editor-tags');
        const projectField  = form.querySelector('#task-editor-project');
        const dueField      = form.querySelector('#task-editor-due');
        const dueDurField   = form.querySelector('#task-editor-due-duration');
        const schedField    = form.querySelector('#task-editor-scheduled');
        const schedDurField = form.querySelector('#task-editor-sched-duration');

        if (tagsField)     taskData.tags          = tagsField.value.split(',').map(t => t.trim()).filter(Boolean);
        if (projectField)  taskData.project        = projectField.value;
        if (dueField)      taskData.due            = dueField.value;
        if (dueDurField)   taskData.due_duration   = dueDurField.value;
        if (schedField)    taskData.scheduled      = schedField.value;
        if (schedDurField) taskData.sched_duration = schedDurField.value;

        this.logTask(taskData);
    }

    async logTask(taskData) {
        try {
            const prepared = this.prepareTaskDataForAPI(taskData, false);
            const response = await fetch('/api/task/log', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(prepared),
            });
            const data = await response.json();
            if (data.success) {
                if (data.deferred_cmd) window.twTerminal?.offerTerminal(data.deferred_cmd);
                this.hide();
                this.onLogSuccess();
            } else {
                this.onSaveError(data.error || 'Failed to log task');
            }
        } catch (error) {
            this.onSaveError('Network error: ' + error.message);
        }
    }

    prepareTaskDataForAPI(taskData, isEdit) {
        const preparedData = {
            description: taskData.description,
            project:     taskData.project  || null,
            priority:    taskData.priority || null,
        };

        // Edit mode sends a diff; add mode sends the full tag list
        if (taskData.tags_add !== undefined || taskData.tags_remove !== undefined) {
            preparedData.tags_add    = taskData.tags_add    || [];
            preparedData.tags_remove = taskData.tags_remove || [];
        } else {
            preparedData.tags = taskData.tags || [];
        }
        
        // Always send date fields — empty string signals "clear this date" to the backend
        if (taskData.due !== undefined)
            preparedData.due = taskData.due ? this.formatDateForTask(taskData.due) : '';
        if (taskData.scheduled !== undefined)
            preparedData.scheduled = taskData.scheduled ? this.formatDateForTask(taskData.scheduled) : '';
        
        if (taskData.due_duration)   preparedData.due_duration   = taskData.due_duration;
        if (taskData.sched_duration) preparedData.sched_duration = taskData.sched_duration;

        if (taskData.state  !== undefined) preparedData.state  = taskData.state  || '';
        if (taskData.depends !== undefined) preparedData.depends = taskData.depends || '';
        if (taskData.wait  !== undefined)
            preparedData.wait  = taskData.wait  ? this.formatDateForTask(taskData.wait)  : '';
        if (taskData.until !== undefined)
            preparedData.until = taskData.until ? this.formatDateForTask(taskData.until) : '';

        return preparedData;
    }
    
    formatDateForTask(dateString) {
        // Convertir le format datetime-local en format TaskWarrior
        if (!dateString) return '';
        
        // Retourner la chaîne avec les secondes ajoutées si nécessaire
        return dateString.length === 16 ? `${dateString}:00` : dateString;
    }

    formatDateForInput(dateString) {
        // Convert TaskWarrior date format to HTML datetime-local format (local time).
        // MUST use local-time methods — toISOString() returns UTC and would show the
        // wrong time for users not in UTC (e.g. UTC-4 sees a 4-hour offset).
        if (!dateString) return '';

        let date;
        if (/^\d{8}T\d{6}Z$/.test(dateString)) {
            // Compact TW UTC format: 20250131T055530Z → parse as UTC
            const y = dateString.slice(0,4), mo = dateString.slice(4,6), d = dateString.slice(6,8);
            const h = dateString.slice(9,11), mi = dateString.slice(11,13);
            date = new Date(`${y}-${mo}-${d}T${h}:${mi}:00Z`);
        } else {
            date = new Date(dateString);
        }
        if (isNaN(date.getTime())) return '';

        const pad = n => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}` +
               `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    formatDurationString(durationString) {
        // Format TaskWarrior duration (e.g., "PT2H30M" or "2h30min") for display
        if (!durationString) return '';
        
        // Handle ISO 8601 duration format (PT2H30M)
        if (durationString.startsWith('PT')) {
            const match = durationString.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
            if (match) {
                const hours = parseInt(match[1] || 0);
                const minutes = parseInt(match[2] || 0);
                const seconds = parseInt(match[3] || 0);
                
                let result = '';
                if (hours > 0) result += `${hours}h `;
                if (minutes > 0) result += `${minutes}m `;
                if (seconds > 0) result += `${seconds}s`;
                
                return result.trim() || '0s';
            }
        }
        
        // Handle simple format (2h30min, 1.5h, etc.)
        return durationString;
    }
    
    // Méthode utilitaire pour convertir entre les formats de priorité
    static convertPriority(priority, fromFormat, toFormat) {
        const priorityMap = {
            'H': 'high',
            'M': 'medium', 
            'L': 'low',
            '': 'None', 
            'high': 'H',
            'medium': 'M',
            'low': 'L',
            'None': ''
        };
        
        if (fromFormat === toFormat) return priority;
        return priorityMap[priority] || priority;
    }
    
    // Méthode pour détruire le composant
    destroy() {
        if (this.modal) {
            if (this.options.inline) {
                this.modal.innerHTML = '';
            } else {
                this.modal.remove();
            }
        }
    }
    
    // Méthode pour mettre à jour les suggestions de projets
    updateProjectSuggestions(projects = []) {
        if (!this.options.showAllFields) return;
        
        const datalist = this.modal?.querySelector('#task-editor-project-options');
        if (!datalist) return;
        
        // Vider les options existantes
        datalist.innerHTML = '';
        
        // Ajouter les nouveaux projets
        projects.forEach(project => {
            if (project) {
                const option = document.createElement('option');
                option.value = project;
                datalist.appendChild(option);
            }
        });
    }

    // ── Annotation management ──────────────────────────────────────────────

    _renderAnnotations(annotations) {
        const annList = this.modal.querySelector('#te-existing-annotations');
        if (!annList) return;
        annList.innerHTML = '';
        annotations.forEach(ann => {
            const text = ann.description || ann;
            const row  = document.createElement('div');
            row.className = 'te-ann-row';
            row.dataset.annText = text;

            const textEl = document.createElement('span');
            textEl.className = 'te-ann-text';
            textEl.textContent = text;

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'te-ann-btn te-ann-edit';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', () => this._openAnnEditor(text, row));

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'te-ann-btn te-ann-del';
            delBtn.textContent = 'Del';
            delBtn.addEventListener('click', () => this._deleteAnnotation(text, row));

            row.appendChild(textEl);
            row.appendChild(editBtn);
            row.appendChild(delBtn);
            annList.appendChild(row);
        });

        // Wire up the add button (use onclick to avoid stacking listeners on re-render)
        const addBtn = this.modal.querySelector('#te-ann-add-btn');
        if (addBtn) addBtn.onclick = () => this._openAnnEditor(null, null);
    }

    _cmInstance() { return this._annCm || null; }

    _openAnnEditor(existingText, anchorRow) {
        const wrap    = this.modal.querySelector('#te-ann-editor-wrap');
        const host    = this.modal.querySelector('#te-ann-cm-host');
        const saveBtn = this.modal.querySelector('#te-ann-save-btn');
        const addBtn  = this.modal.querySelector('#te-ann-add-btn');
        if (!wrap || !host) return;

        // Hide the main form actions so only one Save is visible at a time
        const actions = this.modal.querySelector('.te-actions');
        if (actions) actions.style.display = 'none';

        // Destroy any previous CM instance
        if (this._annCm) { this._annCm.destroy(); this._annCm = null; }
        host.innerHTML = '';

        const CM = window.CM;
        if (CM) {
            this._annCm = new CM.EditorView({
                state: CM.EditorState.create({
                    doc: existingText || '',
                    extensions: [
                        CM.basicSetup,
                        CM.EditorView.lineWrapping,
                        CM.keymap.of([...CM.defaultKeymap, ...CM.historyKeymap]),
                        CM.placeholder(existingText ? 'Edit annotation…' : 'New annotation…'),
                    ],
                }),
                parent: host,
            });
            // Focus and move cursor to end
            this._annCm.focus();
            this._annCm.dispatch({ selection: { anchor: (existingText || '').length } });
        } else {
            // Fallback plain textarea if CM bundle not loaded
            const ta = document.createElement('textarea');
            ta.className = 'te-ann-textarea-fallback';
            ta.value = existingText || '';
            ta.placeholder = existingText ? 'Edit annotation…' : 'New annotation…';
            host.appendChild(ta);
            ta.focus();
        }

        wrap.style.display = '';
        if (addBtn) addBtn.style.display = 'none';
        // Highlight the row being edited
        this.modal.querySelectorAll('.te-ann-row').forEach(r => r.classList.remove('te-ann-editing'));
        if (anchorRow) anchorRow.classList.add('te-ann-editing');

        const getEditorText = () => {
            if (this._annCm) return this._annCm.state.doc.toString().trim();
            const ta = host.querySelector('textarea');
            return ta ? ta.value.trim() : '';
        };

        saveBtn.onclick = async () => {
            const newText = getEditorText();
            if (!newText) return;
            const uuid = this.currentTask?.uuid;
            if (!uuid) return;

            if (existingText) {
                await this._callAPI('PUT', `/api/task/${uuid}/annotation`, {
                    old_annotation: existingText,
                    new_annotation: newText,
                });
            } else {
                await this._callAPI('POST', `/api/task/${uuid}/annotate`, { annotation: newText });
            }
            await this._reloadAnnotations(uuid);
            this._hideAnnEditor();
        };

        // Escape dismisses the annotation editor
        wrap._escHandler = (e) => { if (e.key === 'Escape') { e.stopPropagation(); this._hideAnnEditor(); } };
        wrap.addEventListener('keydown', wrap._escHandler);
    }

    _hideAnnEditor() {
        const wrap    = this.modal.querySelector('#te-ann-editor-wrap');
        const addBtn  = this.modal.querySelector('#te-ann-add-btn');
        const actions = this.modal.querySelector('.te-actions');
        if (wrap) {
            if (wrap._escHandler) { wrap.removeEventListener('keydown', wrap._escHandler); delete wrap._escHandler; }
            wrap.style.display = 'none';
        }
        if (addBtn)  addBtn.style.display  = '';
        if (actions) actions.style.display = '';
        this.modal.querySelectorAll('.te-ann-row').forEach(r => r.classList.remove('te-ann-editing'));
        if (this._annCm) { this._annCm.destroy(); this._annCm = null; }
        const host = this.modal.querySelector('#te-ann-cm-host');
        if (host) host.innerHTML = '';
    }

    async _deleteAnnotation(text, row) {
        const uuid = this.currentTask?.uuid;
        if (!uuid) return;
        const r = await this._callAPI('DELETE', `/api/task/${uuid}/annotation`, { annotation: text });
        if (r?.success !== false) {
            row.remove();
            this._hideAnnEditor();
        }
    }

    async _reloadAnnotations(uuid) {
        try {
            const r = await fetch(`/api/task/${uuid}`);
            const d = await r.json();
            const anns = Array.isArray(d.annotations) ? d.annotations : [];
            this._renderAnnotations(anns);
            // Update currentTask so subsequent edits reference fresh data
            if (this.currentTask) this.currentTask.annotations = anns;
        } catch (_) {}
    }

    async _callAPI(method, url, body) {
        try {
            const r = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            return await r.json();
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
}

// Export pour utilisation en module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TaskEditor;
}
