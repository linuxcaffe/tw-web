"""
Phase 1, second half of the security review (tw:docs/tw-web-dev-infra-plan.md).

S8   A Firefox extension origin may use only the routes tw-web's own popup
     needs (health, server stop, task add, bookmark) — not the terminal,
     settings or anything else. CORS likewise.
S9   Runtime files (hook prompts, spool, PID) live in a private 0700 dir
     under $XDG_RUNTIME_DIR, not in world-writable /tmp.
S10  /api/open only opens paths under $HOME and never .desktop launchers;
     /api/launch passes the value as ONE argument, never an option.
S11  Free text (descriptions, annotations, bookmark titles and URLs) goes
     after `--`, so it can never be read as an rc. override or attribute.
"""
import os
import stat
from pathlib import Path

import pytest

LOCAL = {'Host': 'localhost:5000'}
EXT = 'moz-extension://0d1e2f'


# ── S8 ────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('path', ['/api/health', '/api/server/stop', '/api/task/add', '/api/bookmark'])
def test_extension_allowed_on_popup_routes(app_module, path):
    assert app_module._origin_allowed(EXT, 'localhost:5000', path)


@pytest.mark.parametrize('path', ['/ws/pty', '/api/commands', '/api/config',
                                  '/api/launch', '/api/open', '/api/task/1/done'])
def test_extension_refused_elsewhere(app_module, path):
    assert not app_module._origin_allowed(EXT, 'localhost:5000', path)


def test_extension_post_to_settings_refused(client):
    r = client.post('/api/config', headers={**LOCAL, 'Origin': EXT}, json={'x': 1})
    assert r.status_code == 403


def test_cors_only_on_popup_routes(client):
    ok = client.get('/api/health', headers={**LOCAL, 'Origin': EXT})
    assert ok.headers.get('Access-Control-Allow-Origin') == EXT
    no = client.get('/api/tags', headers={**LOCAL, 'Origin': EXT})
    assert 'Access-Control-Allow-Origin' not in no.headers


# ── S9 ────────────────────────────────────────────────────────────────────────

def test_runtime_dir_prefers_xdg(app_module, tmp_path):
    assert app_module._runtime_dir({'XDG_RUNTIME_DIR': str(tmp_path)}) == tmp_path / 'tw-web'


def test_runtime_dir_fallback_not_tmp(app_module):
    d = app_module._runtime_dir({})
    assert d == Path.home() / '.cache' / 'tw-web'
    assert not str(d).startswith('/tmp')


def test_runtime_dirs_private(app_module):
    for d in (app_module._PROMPT_DIR, app_module._SPOOL_DIR):
        assert d.parent == app_module._RUN_DIR
        assert str(d) not in ('/tmp/tw-web-prompts', '/tmp/tw-web-spool')
        assert stat.S_IMODE(d.stat().st_mode) == 0o700
        assert stat.S_IMODE(d.parent.stat().st_mode) == 0o700


# ── S10 ───────────────────────────────────────────────────────────────────────

def test_open_allowed_rules(app_module, tmp_path):
    home = tmp_path / 'home'; (home / 'docs').mkdir(parents=True)
    f = home / 'docs' / 'a.pdf'; f.write_text('x')
    d = home / 'x.desktop'; d.write_text('[Desktop Entry]')
    out = tmp_path / 'elsewhere.txt'; out.write_text('x')
    link = home / 'link'; link.symlink_to(out)
    assert app_module._open_allowed(str(f), home)
    assert app_module._open_allowed(str(home / 'docs'), home)
    assert not app_module._open_allowed(str(d), home)          # launcher file
    assert not app_module._open_allowed(str(out), home)        # outside $HOME
    assert not app_module._open_allowed(str(link), home)       # symlink escaping $HOME


@pytest.fixture
def no_spawn(app_module, monkeypatch):
    """Record instead of launching: a red test must never open real windows."""
    spawned = []
    monkeypatch.setattr(app_module.subprocess, 'Popen', lambda *a, **k: spawned.append(a[0]))
    return spawned


def test_open_refuses_outside_home(client, no_spawn):
    r = client.post('/api/open', headers=LOCAL, json={'path': '/etc/passwd'})
    assert r.status_code == 403
    assert no_spawn == []


def test_launch_value_is_one_argument(app_module):
    assert app_module._launch_argv('xdg-open {value}', '/home/u/My File.pdf') == ['xdg-open', '/home/u/My File.pdf']
    assert app_module._launch_argv('man {value}', 'git log') == ['man', 'git log']


def test_launch_refuses_option_values(client, app_module, monkeypatch, no_spawn):
    monkeypatch.setattr(app_module, '_load_settings', lambda: {'annotation_launchers': {'file': 'xdg-open {value}'}})
    r = client.post('/api/launch', headers=LOCAL, json={'label': 'file', 'value': '--help'})
    assert r.status_code == 400
    assert no_spawn == []


# ── S11 ───────────────────────────────────────────────────────────────────────

def _free_text_after_separator(args, text):
    assert '--' in args, args
    i = args.index('--')
    assert args[i + 1:] == [text], args
    return args[:i]


def test_add_description_after_separator(client, captured):
    client.post('/api/task/add', headers=LOCAL, json={'description': 'rc.hooks=off', 'project': 'p', 'tags': ['t']})
    before = _free_text_after_separator(captured[0], 'rc.hooks=off')
    assert 'project:p' in before and '+t' in before


def test_log_description_after_separator(client, captured):
    client.post('/api/task/log', headers=LOCAL, json={'description': 'due:tomorrow'})
    _free_text_after_separator(captured[0], 'due:tomorrow')


def test_annotate_after_separator(client, captured):
    client.post('/api/task/1/annotate', headers=LOCAL, json={'annotation': 'rc.verbose=nothing'})
    _free_text_after_separator(captured[0], 'rc.verbose=nothing')


def test_denotate_after_separator(client, captured):
    client.delete('/api/task/1/annotation', headers=LOCAL, json={'annotation': 'rc.x=1'})
    _free_text_after_separator(captured[0], 'rc.x=1')


def test_edit_annotation_after_separator(client, captured):
    client.put('/api/task/1/annotation', headers=LOCAL, json={'old_annotation': 'old', 'new_annotation': 'rc.y=1'})
    _free_text_after_separator(captured[0], 'old')
    _free_text_after_separator(captured[1], 'rc.y=1')


def test_bookmark_after_separator(client, captured):
    client.post('/api/bookmark', headers=LOCAL, json={'title': 'rc.z=1', 'url': 'https://example.org'})
    _free_text_after_separator(captured[0], 'rc.z=1')
    _free_text_after_separator(captured[1], 'https://example.org')
