"""/embed-add: tw-web's own Add dialog, for nb-web to embed (tw-nb-interop M6).

nb-web opens this page in a frame; the user adds the task with tw-web's dialog and its own
/api/task/add (hooks and all); the page then tells nb-web the new task's uuid by postMessage.
Only nb-web may frame it, and the page posts only to nb-web: both come from the origin of
the `nb` annotation launcher (Settings → annotation launchers), so no new setting.
"""
import pytest


def _launchers(app_module, monkeypatch, launchers):
    real = app_module._load_settings
    monkeypatch.setattr(app_module, '_load_settings',
                        lambda: {**real(), 'annotation_launchers': launchers})


def _csp(r):
    return r.headers.get('Content-Security-Policy', '')


def test_page_serves_the_editor(client):
    r = client.get('/embed-add')
    assert r.status_code == 200
    html = r.get_data(as_text=True)
    assert 'task-editor.js' in html and 'tw-api.js' in html
    assert 'postMessage' in html


def test_only_nb_web_may_frame_it(client, app_module, monkeypatch):
    _launchers(app_module, monkeypatch, {'nb': 'http://localhost:5001/#{value}'})
    r = client.get('/embed-add')
    assert _csp(r) == "frame-ancestors 'self' http://localhost:5001"
    assert '"http://localhost:5001"' in r.get_data(as_text=True), 'the page posts to that origin'


def test_without_an_nb_launcher_only_tw_web_may_frame_it(client, app_module, monkeypatch):
    _launchers(app_module, monkeypatch, {'file': 'xdg-open {value}'})
    r = client.get('/embed-add')
    assert _csp(r) == "frame-ancestors 'self'"
    assert 'const NB_ORIGIN = null;' in r.get_data(as_text=True)


@pytest.mark.parametrize('url', ['nb {value}', 'javascript:alert(1)//{value}',
                                 'http://evil.example" onload="x/#{value}',
                                 "http://a.b/'; frame-ancestors */#{value}"])
def test_odd_launchers_never_widen_framing_or_reach_the_page(client, app_module, monkeypatch, url):
    _launchers(app_module, monkeypatch, {'nb': url})
    r = client.get('/embed-add')
    csp = _csp(r)
    assert csp.startswith("frame-ancestors 'self'")
    assert '*' not in csp and ';' not in csp and '"' not in csp and "'" not in csp.replace("'self'", '')
    html = r.get_data(as_text=True)
    assert 'onload=' not in html and 'javascript:' not in html


def test_other_pages_keep_their_headers(client):
    assert 'frame-ancestors' not in _csp(client.get('/'))


# ── /embed-edit: the same page in Edit mode (tw-nb-interop, djp 2026-11-01) ─────────────

def test_edit_page_is_the_same_page_with_the_same_framing(client, app_module, monkeypatch):
    _launchers(app_module, monkeypatch, {'nb': 'http://localhost:5001/#{value}'})
    r = client.get('/embed-edit?uuid=0badc0de-1234-4abc-8def-0123456789ab')
    assert r.status_code == 200
    assert _csp(r) == "frame-ancestors 'self' http://localhost:5001"
    html = r.get_data(as_text=True)
    assert 'task-editor.js' in html and 'tw-task-saved' in html
