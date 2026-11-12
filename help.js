// help.js — the Help page: four tabs of markdown pages from docs/help/ (tw:docs/tw-web-help-plan.md).
// Routes (location.hash): #<tab>, #<tab>/<page>, #<tab>/<page>/<anchor>, #<tab>/<category-slug>.
// Pages come from api/help (index) and api/help/page/<tab>/<name>; the Commands tab lists
// api/help/commands (`task commands`), linking the commands that have a page.
// Page markdown is ours, but raw HTML in it is shown as text, never parsed (S6).
(function () {
    'use strict';

    const TABS = [
        { id: 'keys', label: 'Keys', head: 'Keyboard shortcuts in the current version of tw-web.' },
        { id: 'tw-web', label: 'tw-web', head: 'This applies to the current version of tw-web.',
          more: ['README and source on GitHub', 'https://github.com/linuxcaffe/tw-web#readme'] },
        { id: 'commands', label: 'Commands',
          head: "Taskwarrior 2.6.2 commands, as `task commands` lists them here (your own reports included). " +
                "Most can be run in tw-web's command bar; those that need a terminal open in the console." },
        { id: 'taskwarrior', label: 'Taskwarrior',
          head: "This is Taskwarrior CLI help (2.6.2). Filters, dates and tags work the same in tw-web's filter and command bars." },
    ];
    const FOLDER = { keys: '', 'tw-web': 'tw-web/', commands: 'taskwarrior/commands/', taskwarrior: 'taskwarrior/' };
    const OPEN_KEY = 'tw-help-open', MODE_KEY = 'tw-help-mode';

    let index = null, categories = {}, commandRows = null;
    const lists = {}, scrolls = {};
    let el = {};

    // ── small helpers ───────────────────────────────────────────────────────
    const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function make(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }
    function load(key, dflt) {
        try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : dflt; } catch (e) { return dflt; }
    }
    function save(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private window: fine */ }
    }
    // inline `code` in the tab headers
    const headHtml = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');

    function parseHash() {
        const [tab, name, anchor] = decodeURIComponent(location.hash.slice(1)).split('/');
        return { tab: TABS.some(t => t.id === tab) ? tab : 'keys', name: name || '', anchor: anchor || '' };
    }

    // ── the items a tab lists ───────────────────────────────────────────────
    function items(tab) {
        if (tab === 'commands' && commandRows) {
            const pages = index.tabs.commands || [];
            return commandRows.map(r => ({
                name: r.command, title: r.command, category: r.category || 'other', summary: r.description,
                page: pages.some(p => p.name === r.command),
            }));
        }
        return (index.tabs[tab] || []).map(p => ({ ...p, page: true }));
    }
    function categoryOrder(tab, list) {
        const known = categories[tab] || [];
        const seen = [...new Set(list.map(i => i.category))];
        return [...known.filter(c => seen.includes(c)), ...seen.filter(c => !known.includes(c)).sort()];
    }
    const byTitle = (a, b) => a.title.replace(/^_/, '').localeCompare(b.title.replace(/^_/, ''));

    function itemNode(tab, it, withCategory) {
        const li = make('li', 'help-item');
        li.dataset.text = (it.title + ' ' + (it.summary || '')).toLowerCase();
        if (withCategory) li.appendChild(make('span', 'help-item-cat', it.category));
        const main = make('span', 'help-item-main');
        if (it.page) {
            const a = make('a', 'help-item-link', it.title);
            a.href = '#' + tab + '/' + it.name;
            main.appendChild(a);
        } else {
            main.appendChild(make('span', 'help-item-nolink', it.title));
        }
        if (it.summary) main.appendChild(make('span', 'help-item-summary', it.summary));
        li.appendChild(main);
        return li;
    }

    // ── a tab's list: foldable categories, or A–Z ──────────────────────────
    function buildList(tab) {
        const wrap = make('div', 'help-list');
        const list = items(tab);
        const mode = load(MODE_KEY, 'grouped');
        const open = load(OPEN_KEY, {});
        const order = categoryOrder(tab, list);

        const bar = make('div', 'help-list-bar');
        const filter = make('input', 'help-filter');
        filter.type = 'search';
        filter.placeholder = 'Filter titles…';
        filter.setAttribute('aria-label', 'Filter help pages');
        const toggle = make('div', 'help-mode');
        for (const [m, label] of [['grouped', 'Grouped'], ['az', 'A–Z']]) {
            const b = make('button', 'help-mode-btn' + (m === mode ? ' active' : ''), label);
            b.type = 'button';
            b.dataset.mode = m;
            b.addEventListener('click', () => { save(MODE_KEY, m); rebuildAll(); });
            toggle.appendChild(b);
        }
        bar.append(filter, toggle);
        wrap.appendChild(bar);

        const body = make('div', 'help-list-body');
        if (mode === 'az') {
            const ul = make('ul', 'help-az');
            [...list].sort(byTitle).forEach(it => ul.appendChild(itemNode(tab, it, true)));
            body.appendChild(ul);
        } else {
            order.forEach((cat, i) => {
                const inCat = list.filter(it => it.category === cat).sort(byTitle);
                const det = make('details', 'help-cat');
                det.dataset.cat = slug(cat);
                const stored = open[tab] && open[tab][cat];
                det.open = stored != null ? stored : (i === 0 && cat !== 'internal');
                const sum = make('summary', null);
                sum.append(make('span', 'help-cat-name', cat), make('span', 'help-cat-count', '(' + inCat.length + ')'));
                det.appendChild(sum);
                const ul = make('ul', 'help-items');
                inCat.forEach(it => ul.appendChild(itemNode(tab, it, false)));
                det.appendChild(ul);
                det.addEventListener('toggle', () => {
                    if (det.dataset.filtering) return;
                    const o = load(OPEN_KEY, {});
                    (o[tab] = o[tab] || {})[cat] = det.open;
                    save(OPEN_KEY, o);
                });
                body.appendChild(det);
            });
        }
        const none = make('p', 'help-none', 'No page matches.');
        none.hidden = true;
        body.appendChild(none);
        wrap.appendChild(body);

        filter.addEventListener('input', () => applyFilter(wrap, filter.value));
        return wrap;
    }

    function applyFilter(wrap, text) {
        const q = text.trim().toLowerCase();
        let any = false;
        wrap.querySelectorAll('.help-item').forEach(li => {
            li.hidden = !!q && !li.dataset.text.includes(q);
            any = any || !li.hidden;
        });
        wrap.querySelectorAll('details.help-cat').forEach(det => {
            const hits = det.querySelectorAll('.help-item:not([hidden])').length;
            det.hidden = !!q && !hits;
            if (q) {
                if (!det.dataset.filtering) { det.dataset.filtering = '1'; det.dataset.was = det.open ? '1' : ''; }
                if (hits) det.open = true;
            } else if (det.dataset.filtering) {
                det.open = !!det.dataset.was;
                // the toggle event fires after this task: clear the flag after it
                setTimeout(() => { delete det.dataset.filtering; delete det.dataset.was; }, 0);
            }
        });
        wrap.querySelector('.help-none').hidden = !q || any;
    }

    function rebuildAll() {
        for (const tab of Object.keys(lists)) {
            const old = lists[tab];
            lists[tab] = buildList(tab);
            old.replaceWith(lists[tab]);
        }
        route();
    }

    // ── a page ──────────────────────────────────────────────────────────────
    function resolveLink(tab, href) {
        // Relative .md links between help pages → in-page routes; '#x' → this page's anchor.
        if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
        const u = new URL(href, 'http://help.invalid/' + FOLDER[tab] + 'here');
        const anchor = u.hash.slice(1);
        const path = u.pathname.replace(/^\//, '');
        if (path === FOLDER[tab] + 'here') return { self: true, anchor };
        const m = path.match(/^(?:(tw-web|taskwarrior\/commands|taskwarrior)\/)?([a-z0-9_-]+)\.md$/);
        if (!m) return null;
        const t = { 'tw-web': 'tw-web', 'taskwarrior/commands': 'commands', taskwarrior: 'taskwarrior' }[m[1]] || 'keys';
        if (t === 'keys') return { route: '#keys' + (anchor ? '/' + anchor : '') };
        return { route: '#' + t + '/' + m[2] + (anchor ? '/' + anchor : '') };
    }

    function renderMarkdown(tab, name, md) {
        const html = marked.parse(md);
        const box = make('div', 'help-md');
        box.innerHTML = html;
        box.querySelectorAll('h1, h2, h3, h4').forEach(h => { if (!h.id) h.id = slug(h.textContent); });
        box.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href');
            if (/^\s*javascript:/i.test(href)) { a.removeAttribute('href'); return; }
            if (/^image:/i.test(a.textContent)) a.classList.add('help-image');
            const r = resolveLink(tab, href);
            if (r && r.self) a.setAttribute('href', '#' + tab + (tab === 'keys' ? '' : '/' + name) + (r.anchor ? '/' + r.anchor : ''));
            else if (r) a.setAttribute('href', r.route);
            else if (/^https?:/i.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        });
        return box;
    }

    async function showPage(tab, name, anchor) {
        const seq = (showPage.seq = (showPage.seq || 0) + 1);
        el.page.replaceChildren(make('p', 'help-loading', 'Loading…'));
        let data;
        try {
            const r = await fetch('api/help/page/' + encodeURIComponent(tab) + '/' + encodeURIComponent(name));
            data = await r.json();
        } catch (e) {
            data = { success: false, error: "tw-web server isn't answering" };
        }
        if (seq !== showPage.seq) return;
        el.page.replaceChildren();
        if (tab !== 'keys') {
            const back = make('a', 'help-back', '← ' + TABS.find(t => t.id === tab).label);
            back.href = '#' + tab;
            el.page.appendChild(back);
        }
        if (!data.success) {
            el.page.appendChild(make('p', 'help-error', data.error || 'No such help page'));
            return;
        }
        el.page.appendChild(renderMarkdown(tab, name, data.markdown));
        const target = anchor && document.getElementById(anchor);
        if (target) target.scrollIntoView();
        else window.scrollTo(0, 0);
    }

    // ── routing ─────────────────────────────────────────────────────────────
    let shown = { tab: null, list: false };
    function route() {
        const { tab, name, anchor } = parseHash();
        if (shown.list && shown.tab) scrolls[shown.tab] = window.scrollY;
        el.tabs.querySelectorAll('.help-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        el.tabs.querySelectorAll('.help-tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
        const t = TABS.find(x => x.id === tab);
        el.head.innerHTML = headHtml(t.head);
        if (t.more) {
            const a = make('a', null, t.more[0]);
            a.href = t.more[1]; a.target = '_blank'; a.rel = 'noopener noreferrer';
            el.head.append(' ', a);
        }
        Object.values(lists).forEach(l => { l.hidden = true; });

        const pageNames = (index.tabs[tab] || []).map(p => p.name);
        if (tab === 'keys' || pageNames.includes(name)) {
            el.page.hidden = false;
            shown = { tab, list: false };
            showPage(tab, tab === 'keys' ? 'keys' : name, tab === 'keys' ? name : anchor);   // #keys/<anchor>
            return;
        }
        el.page.hidden = true;
        if (!lists[tab]) { lists[tab] = buildList(tab); el.lists.appendChild(lists[tab]); }
        lists[tab].hidden = false;
        const wasList = shown.list && shown.tab === tab;
        shown = { tab, list: true };
        const cat = name && lists[tab].querySelector('details.help-cat[data-cat="' + CSS.escape(name) + '"]');
        if (cat) { cat.open = true; cat.scrollIntoView(); }
        else if (!wasList) window.scrollTo(0, scrolls[tab] || 0);
    }

    async function init() {
        el = {
            tabs: document.getElementById('help-tabs'), head: document.getElementById('help-head'),
            lists: document.getElementById('help-lists'), page: document.getElementById('help-page'),
        };
        marked.use({ renderer: { html: tok => esc(tok.text || tok.raw || '') } });
        TABS.forEach(t => {
            const b = make('button', 'help-tab', t.label);
            b.type = 'button';
            b.dataset.tab = t.id;
            b.setAttribute('role', 'tab');
            b.addEventListener('click', () => { location.hash = '#' + t.id; });
            el.tabs.appendChild(b);
        });
        try {
            const r = await fetch('api/help');
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'help index failed');
            index = d; categories = d.categories || {};
        } catch (e) {
            el.page.replaceChildren(make('p', 'help-error', "Couldn't load help: tw-web server isn't answering."));
            return;
        }
        try {
            const r = await fetch('api/help/commands');
            const d = await r.json();
            if (d.success) commandRows = d.commands;
        } catch (e) { /* the Commands tab falls back to its pages */ }
        window.addEventListener('hashchange', route);
        route();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
