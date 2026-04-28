'use strict';

const TW_WEB = 'http://localhost:5000';

let currentUrl = '';
let serverOnline = false;

// Fill URL/title from active tab
browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
    const tab = tabs[0];
    if (!tab) return;
    currentUrl = tab.url || '';
    document.getElementById('bm-title').value = tab.title || '';
    const preview = document.getElementById('url-preview');
    preview.textContent = currentUrl;
    preview.title = currentUrl;
});

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const pane = document.getElementById(tab.dataset.pane);
        pane.classList.add('active');
        const first = pane.querySelector('input, select');
        if (first) first.focus();
        if (tab.dataset.pane === 'pane-twweb') checkStatus();
    });
});

// Open tw-web — focus existing tab if already open, else create one
document.getElementById('btn-open').addEventListener('click', async () => {
    const existing = await browser.tabs.query({ url: `${TW_WEB}/*` });
    if (existing.length) {
        await browser.tabs.update(existing[0].id, { active: true });
        await browser.windows.update(existing[0].windowId, { focused: true });
    } else {
        await browser.tabs.create({ url: TW_WEB });
    }
    window.close();
});

// GitHub link
document.getElementById('gh-link').addEventListener('click', e => {
    e.preventDefault();
    browser.tabs.create({ url: 'https://github.com/linuxcaffe/tw-web' });
    window.close();
});

// ── Server stop/start ──────────────────────────────────────────────────────

const btnStopStart = document.getElementById('btn-stop-start');
const stopConfirm  = document.getElementById('stop-confirm');

btnStopStart.addEventListener('click', async () => {
    if (serverOnline) {
        stopConfirm.classList.add('show');
        btnStopStart.style.display = 'none';
    } else {
        btnStopStart.disabled = true;
        btnStopStart.textContent = 'Starting…';
        document.getElementById('status-label').textContent = 'Starting…';
        try {
            const resp = await browser.runtime.sendNativeMessage(
                'tw_web_launcher', { cmd: 'start' }
            );
            if (resp.success) {
                await checkStatus();
            } else {
                document.getElementById('status-label').textContent =
                    resp.message || 'Failed to start';
            }
        } catch (e) {
            document.getElementById('status-label').textContent =
                'Native host unavailable — check install instructions';
        }
        btnStopStart.disabled = false;
    }
});

document.getElementById('btn-stop-yes').addEventListener('click', async () => {
    stopConfirm.classList.remove('show');
    document.getElementById('status-label').textContent = 'Stopping…';
    try {
        await fetch(`${TW_WEB}/api/server/stop`, { method: 'POST', signal: AbortSignal.timeout(1500) });
    } catch { /* expected — server may die before response */ }
    // Retry-poll until offline (up to ~5s)
    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 500));
        await checkStatus();
        if (!serverOnline) break;
    }
});

document.getElementById('btn-stop-no').addEventListener('click', () => {
    stopConfirm.classList.remove('show');
    btnStopStart.style.display = '';
});

async function checkStatus() {
    const dot    = document.getElementById('status-dot');
    const label  = document.getElementById('status-label');
    const health = document.getElementById('health-info');
    stopConfirm.classList.remove('show');
    try {
        const r = await fetch(`${TW_WEB}/api/health`, { signal: AbortSignal.timeout(2000) });
        if (r.ok) {
            serverOnline = true;
            const d = await r.json();
            const uptime = fmtUptime(d.uptime_seconds);
            label.textContent = 'Running · localhost:5000';
            health.innerHTML =
                `${d.pending_count} pending tasks · up ${uptime} · TW ${d.tw_version}`;
            health.style.display = '';
        } else {
            serverOnline = false;
        }
    } catch {
        serverOnline = false;
    }
    if (serverOnline) {
        dot.className = 'status-dot online';
        btnStopStart.textContent = 'Stop';
        btnStopStart.className = 'stop';
        btnStopStart.style.display = '';
    } else {
        dot.className = 'status-dot offline';
        label.textContent = 'Not running';
        health.style.display = 'none';
        btnStopStart.textContent = 'Start';
        btnStopStart.className = '';
        btnStopStart.style.display = '';
    }
}

function fmtUptime(s) {
    if (s < 60)   return `${s}s`;
    if (s < 3600) return `${Math.floor(s/60)}m`;
    return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
}

// ── Add task ──────────────────────────────────────────────────────────────

document.getElementById('btn-add').addEventListener('click', async () => {
    const desc    = document.getElementById('add-desc').value.trim();
    const project = document.getElementById('add-project').value.trim();
    const pri     = document.getElementById('add-pri').value;
    const tagsRaw = document.getElementById('add-tags').value.trim();
    const btn     = document.getElementById('btn-add');

    if (!desc) { showStatus('#status2', 'Description is required', 'err'); return; }

    const tags = tagsRaw ? tagsRaw.split(/[\s,]+/).map(t => t.replace(/^\+/, '')).filter(Boolean) : [];
    const body = { description: desc };
    if (project) body.project = project;
    if (pri)     body.priority = pri;
    if (tags.length) body.tags = tags;

    btn.disabled = true;
    btn.textContent = 'Adding…';
    clearStatus('#status2');

    try {
        const r = await fetch(`${TW_WEB}/api/task/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const d = await r.json();
        if (d.success) {
            const id = d.task?.id ? ` (task ${d.task.id})` : '';
            showStatus('#status2', `Added${id} ✓`, 'ok');
            btn.textContent = 'Added!';
            setTimeout(() => window.close(), 1200);
        } else {
            showStatus('#status2', d.error || 'Failed', 'err');
            btn.disabled = false;
            btn.textContent = 'Add task';
        }
    } catch {
        showStatus('#status2', 'Could not reach tw-web — is Flask running?', 'err');
        btn.disabled = false;
        btn.textContent = 'Add task';
    }
});

// ── Bookmark ──────────────────────────────────────────────────────────────

document.getElementById('btn-bookmark').addEventListener('click', async () => {
    const title   = document.getElementById('bm-title').value.trim();
    const project = document.getElementById('bm-project').value.trim();
    const tags    = document.getElementById('bm-tags').value.trim();
    const btn     = document.getElementById('btn-bookmark');

    if (!title) { showStatus('#status', 'Title is required', 'err'); return; }

    btn.disabled = true;
    btn.textContent = 'Saving…';
    clearStatus('#status');

    try {
        const r = await fetch(`${TW_WEB}/api/bookmark`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, url: currentUrl, project, tags }),
        });
        const d = await r.json();
        if (d.success) {
            const id = d.task?.id ? ` (task ${d.task.id})` : '';
            showStatus('#status', `Saved${id} ✓`, 'ok');
            btn.textContent = 'Saved!';
            setTimeout(() => window.close(), 1200);
        } else {
            showStatus('#status', d.error || 'Failed', 'err');
            btn.disabled = false;
            btn.textContent = 'Bookmark';
        }
    } catch {
        showStatus('#status', 'Could not reach tw-web — is Flask running?', 'err');
        btn.disabled = false;
        btn.textContent = 'Bookmark';
    }
});

// ── Enter key submits active pane ─────────────────────────────────────────

document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const pane = document.querySelector('.pane.active');
    if (!pane) return;
    if (pane.id === 'pane-add')      document.getElementById('btn-add').click();
    else if (pane.id === 'pane-bookmark') document.getElementById('btn-bookmark').click();
});

// ── Helpers ───────────────────────────────────────────────────────────────

function showStatus(sel, msg, cls) {
    const el = document.querySelector(sel);
    el.textContent = msg;
    el.className = cls;
}
function clearStatus(sel) {
    const el = document.querySelector(sel);
    el.className = '';
    el.style.display = 'none';
}
