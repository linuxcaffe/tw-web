"""
tw-web's pages name their own files and routes by relative path (`api/tasks`, `kanban.html`,
`./`), never root-absolute (`/api/tasks`, `/kanban.html`, `/`). All pages sit at one level, so
relative paths work when tw-web is served at its own root (`localhost:5000/`) and when a proxy
serves it under a prefix (`/tw/`, beside nb-web at `/` on one origin: tw-nb-interop M7 (d),
djp 2026-11-02). tw-web needs no prefix setting. A root-absolute path behind the proxy reaches
the other app: in the spike, every `/api/*` call got nb-web's 401 and tw-web tried to register
nb-web's `/sw.js`.

The names come from the app itself (its routes' first segments and the files it serves), so a
new page or route is covered without editing this test.
"""
import re
import subprocess
from pathlib import Path

import app as tw_app

ROOT = Path(tw_app.__file__).parent
VENDORED = re.compile(r'(\.min\.(js|css)|^xterm\.(js|css)|^codemirror-bundle\.js|^package(-lock)?\.json)$')


def _shipped():
    out = subprocess.check_output(['git', 'ls-files'], cwd=ROOT, text=True).split()
    return [f for f in out if '/' not in f and re.search(r'\.(js|html|css|json)$', f)
            and not VENDORED.search(f)]


def _own_names():
    names = {f for f in subprocess.check_output(['git', 'ls-files'], cwd=ROOT, text=True).split()
             if '/' not in f}
    for rule in tw_app.app.url_map.iter_rules():
        first = rule.rule.strip('/').split('/')[0]
        if first and not first.startswith('<'):
            names.add(first)
    return names


def _violations():
    names = sorted(_own_names(), key=len, reverse=True)
    own = re.compile(r"""(?:["'`(=]|\$\{location\.host\})/(""" +
                     '|'.join(re.escape(n) for n in names) + r""")(?![\w.-])""")
    bare = re.compile(r"""(?:href\s*[:=]\s*|location\.href\s*=\s*|replaceState\([^)]*,\s*|"start_url"\s*:\s*|"scope"\s*:\s*|'[A-Z]'\s*:\s*|pathname\s*[!=]==?\s*)["'`]/["'`?#]""")
    # pathname compared with any literal is prefix-blind either way ('/x' never matches under
    # /tw/, 'x' never matches at all): compare with endsWith, or onList() in nav.js
    pathname_eq = re.compile(r"""pathname\s*[!=]==?\s*["'`]""")
    bare_item = re.compile(r"""["'`]/["'`]\s*[,\]]""")   # '/' as a list entry (sw.js's shell)
    found = []
    for f in _shipped():
        for n, line in enumerate((ROOT / f).read_text().splitlines(), 1):
            if re.match(r'\s*(//|\*|/\*|<!--)', line):
                continue                                  # a comment naming a path isn't a URL
            local = re.sub(r'https?://\S+', '', line)   # an external URL's path isn't ours
            local = re.sub(r'\.(?:includes|endsWith)\((["\'`])[^"\'`]*\1\)', '', local)   # substring tests are prefix-proof
            for rx in (own, bare, pathname_eq, bare_item):
                if rx.search(local):
                    found.append(f'{f}:{n}: {line.strip()[:100]}')
                    break
    return found


def test_own_files_and_routes_are_named_relatively():
    found = _violations()
    assert not found, 'root-absolute paths (use api/…, page.html, ./):\n' + '\n'.join(found)


def test_the_names_come_from_the_app():
    names = sorted(_own_names(), key=len, reverse=True)
    assert {'api', 'ws', 'embed-edit', 'kanban.html', 'sw.js', 'manifest.json'} <= set(names)


def test_the_service_worker_touches_only_its_own_caches():
    """One origin with nb-web means one cache storage: tw-web's worker reads only its own cache
    (not caches.match, which searches every cache on the origin) and deletes only its own old
    tw-web-* caches on activate, never nb-web's."""
    sw = (ROOT / 'sw.js').read_text()
    assert "const CACHE = 'tw-web-" in sw
    assert not re.search(r'(?<![\w.])caches\.match\(', sw), 'use caches.open(CACHE).then(c => c.match(…))'
    assert "k.startsWith('tw-web-')" in sw
