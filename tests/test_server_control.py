"""The server's own health and control: /api/ping (the page's "is it there?"), /api/server/restart,
and termux-exec on Android (tw:docs/tw-web-android-plan.md, step 7 items 1–3).

None of these tests stop or restart anything: the restart is stubbed, and /api/server/stop is never
called (its PID file can point at the live server)."""
import pytest

LOCAL = {'Host': 'localhost:5000'}
TRUSTED = {**LOCAL, 'Origin': 'http://localhost:5000'}


# ── termux-exec ───────────────────────────────────────────────────────────────
# Started from Termux:Widget, Python gets no LD_PRELOAD, so every hook's `#!/usr/bin/env python3`
# fails "No such file or directory" (found on s5, 2026-10-22).

def _termux(tmp_path, *libs):
    (tmp_path / 'lib').mkdir(parents=True)
    for name in libs:
        (tmp_path / 'lib' / name).write_text('')
    return {'PREFIX': str(tmp_path), 'TERMUX_VERSION': '0.118.1'}


def test_termux_preload_found_when_missing(app_module, tmp_path):
    env = _termux(tmp_path, 'libtermux-exec.so', 'libtermux-exec-ld-preload.so')
    assert app_module._termux_preload(env) == str(tmp_path / 'lib' / 'libtermux-exec-ld-preload.so')


def test_termux_preload_falls_back_to_the_old_name(app_module, tmp_path):
    env = _termux(tmp_path, 'libtermux-exec.so')
    assert app_module._termux_preload(env) == str(tmp_path / 'lib' / 'libtermux-exec.so')


def test_termux_preload_leaves_a_set_one_and_other_systems_alone(app_module, tmp_path):
    env = _termux(tmp_path, 'libtermux-exec-ld-preload.so')
    assert app_module._termux_preload({**env, 'LD_PRELOAD': '/x/lib.so'}) is None
    assert app_module._termux_preload({'PREFIX': str(tmp_path)}) is None, 'not Termux'
    assert app_module._termux_preload(_termux(tmp_path / 'empty')) is None, 'no library there'


# ── /api/ping ─────────────────────────────────────────────────────────────────

def test_ping_answers_without_running_task(client, captured):
    r = client.get('/api/ping', headers=LOCAL)
    assert r.status_code == 200
    d = r.get_json()
    assert d['ok'] is True and d['termux'] is False and isinstance(d['started'], (int, float))
    assert captured == [], 'a ping every 30 s must not run task'


# ── /api/server/restart ───────────────────────────────────────────────────────

@pytest.fixture
def restarts(app_module, monkeypatch):
    calls = []
    monkeypatch.setattr(app_module, '_restart_soon', lambda: calls.append('restart'))
    return calls


def test_restart_asks_the_reloader_for_a_fresh_server(client, restarts, monkeypatch):
    monkeypatch.setenv('WERKZEUG_RUN_MAIN', 'true')
    r = client.post('/api/server/restart', headers=TRUSTED)
    assert r.status_code == 200 and r.get_json()['success'] is True
    assert restarts == ['restart']


def test_restart_without_the_reloader_says_so(client, restarts, monkeypatch):
    monkeypatch.delenv('WERKZEUG_RUN_MAIN', raising=False)
    r = client.post('/api/server/restart', headers=TRUSTED)
    assert r.status_code == 409 and r.get_json()['success'] is False
    assert restarts == []


def test_restart_is_a_post_and_origin_checked(client, restarts, monkeypatch):
    monkeypatch.setenv('WERKZEUG_RUN_MAIN', 'true')
    assert client.get('/api/server/restart', headers=LOCAL).status_code in (404, 405)
    assert restarts == [], 'a GET never restarts'
    r = client.post('/api/server/restart', headers={**LOCAL, 'Origin': 'http://attacker.example'})
    assert r.status_code == 403 and restarts == []
