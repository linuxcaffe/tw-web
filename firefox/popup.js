'use strict';

const TW_WEB = 'http://localhost:5000';

let currentUrl = '';

// Fill fields from active tab
browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
    const tab = tabs[0];
    if (!tab) return;
    currentUrl = tab.url || '';
    document.getElementById('title').value = tab.title || '';
    const preview = document.getElementById('url-preview');
    preview.textContent = currentUrl;
    preview.title = currentUrl;
});

// Open tw-web in a new tab
document.getElementById('open-twweb').addEventListener('click', () => {
    browser.tabs.create({ url: TW_WEB });
    window.close();
});

document.getElementById('btn-open').addEventListener('click', () => {
    browser.tabs.create({ url: TW_WEB });
    window.close();
});

document.getElementById('btn-add').addEventListener('click', () => {
    browser.tabs.create({ url: `${TW_WEB}/?add=1` });
    window.close();
});

// Save bookmark
document.getElementById('btn-save').addEventListener('click', async () => {
    const title   = document.getElementById('title').value.trim();
    const project = document.getElementById('project').value.trim();
    const tags    = document.getElementById('tags').value.trim();
    const btn     = document.getElementById('btn-save');
    const status  = document.getElementById('status');

    if (!title) {
        showStatus('Title is required', 'err');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving…';
    status.className = '';
    status.style.display = 'none';

    try {
        const r = await fetch(`${TW_WEB}/api/bookmark`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, url: currentUrl, project, tags }),
        });
        const d = await r.json();
        if (d.success) {
            const id = d.task?.id ? ` (task ${d.task.id})` : '';
            showStatus(`Saved${id} ✓`, 'ok');
            btn.textContent = 'Saved!';
            setTimeout(() => window.close(), 1200);
        } else {
            showStatus(d.error || 'Failed', 'err');
            btn.disabled = false;
            btn.textContent = 'Save bookmark';
        }
    } catch (e) {
        showStatus('Could not reach tw-web — is Flask running?', 'err');
        btn.disabled = false;
        btn.textContent = 'Save bookmark';
    }
});

// Enter key submits
document.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-save').click();
});

function showStatus(msg, cls) {
    const el = document.getElementById('status');
    el.textContent = msg;
    el.className = cls;
}
