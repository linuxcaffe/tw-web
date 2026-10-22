"""Sync (Android plan, step 7 items 4–7): the advisory (incoming by station, stations last seen),
automatic sync, a lock between sync and task commands, the longer sync timeout, the Sync note
as gittw's commit message, and termux-open for file links.

Nothing here runs gittw or touches ~/.task: run_command is stubbed, and the git history test
builds its own repo in a temp dir."""
import json
import subprocess
import threading
import time

import pytest

LOCAL = {'Host': 'localhost:5000'}
TRUSTED = {**LOCAL, 'Origin': 'http://localhost:5000'}

STATUS = {'station': 'yoga', 'uncommitted': 2, 'unpushed': 1, 'behind': 3,
          'incoming': {'s5': 3}, 'last_seen': {'s5': '2026-10-22T07:59:22Z', 'yoga': '2026-10-22T08:07:04Z'},
          'merge_driver': True}


@pytest.fixture
def gittw(app_module, monkeypatch, tmp_path):
    """gittw 'installed', its commands recorded; ~/.task stands in as a temp dir."""
    calls = []
    monkeypatch.setattr(app_module, '_gittw', lambda: '/x/gittw')
    monkeypatch.setattr(app_module, '_task_dir', lambda: tmp_path)
    monkeypatch.setattr(app_module, '_SETTINGS_PATH', tmp_path / 'settings.json')
    (tmp_path / '.git').mkdir()
    def fake(args, timeout=None):
        calls.append((list(args), timeout))
        if args[1:3] == ['status', '--json'] or args[1:4] == ['status', '--fetch', '--json']:
            return {'success': True, 'stdout': json.dumps(STATUS), 'stderr': '', 'returncode': 0}
        return {'success': True, 'stdout': 'synced', 'stderr': '', 'returncode': 0}
    monkeypatch.setattr(app_module, 'run_command', fake)
    monkeypatch.setattr(app_module, '_git_head', lambda td: 'abc')
    return calls


# ── item 6: the Sync note is gittw's commit message ───────────────────────────

def test_sync_note_goes_to_gittw_sync_m(client, gittw):
    r = client.post('/api/sync', headers=TRUSTED, json={'message': 'phone edits'})
    assert r.get_json()['success'] is True
    syncs = [a for a, _ in gittw if a[1] == 'sync']
    assert syncs == [['/x/gittw', 'sync', '-m', 'phone edits']], 'tw-web must not git commit itself'


def test_sync_without_a_note(client, gittw):
    client.post('/api/sync', headers=TRUSTED, json={})
    assert [a for a, _ in gittw if a[1] == 'sync'] == [['/x/gittw', 'sync']]


# ── item 5: sync gets longer than a task command ──────────────────────────────

def test_sync_timeout_is_longer_than_a_task_command(client, gittw, app_module):
    client.post('/api/sync', headers=TRUSTED, json={})
    [(args, timeout)] = [(a, t) for a, t in gittw if a[1] == 'sync']
    assert timeout == app_module.SYNC_TIMEOUT and app_module.SYNC_TIMEOUT >= 4 * app_module.TASK_TIMEOUT


# ── item 4: the advisory ──────────────────────────────────────────────────────

def test_status_carries_incoming_and_last_seen(client, gittw):
    d = client.get('/api/sync/status', headers=LOCAL).get_json()
    assert d['station'] == 'yoga' and d['incoming'] == {'s5': 3} and d['behind'] == 3
    assert set(d['last_seen']) == {'s5', 'yoga'}
    assert ['/x/gittw', 'status', '--json'] in [a for a, _ in gittw], 'no fetch unless asked'


def test_status_fetch_asks_gittw_to_fetch_first(client, gittw, app_module):
    client.get('/api/sync/status?fetch=1', headers=LOCAL)
    [(args, timeout)] = [(a, t) for a, t in gittw if a[1] == 'status']
    assert args == ['/x/gittw', 'status', '--fetch', '--json'] and timeout >= 30


def test_status_says_how_automatic_sync_is_doing(client, gittw, app_module, monkeypatch):
    monkeypatch.setitem(app_module._auto_sync, 'last', 1792695905.0)
    monkeypatch.setitem(app_module._auto_sync, 'last_ok', False)
    monkeypatch.setitem(app_module._auto_sync, 'last_note', 'could not reach codeberg.org')
    d = client.get('/api/sync/status', headers=LOCAL).get_json()
    assert d['auto'] == {'enabled': True, 'last': 1792695905.0, 'last_ok': False,
                         'last_note': 'could not reach codeberg.org'}


def _repo(tmp_path):
    def git(*a):
        subprocess.run(['git', '-C', str(tmp_path), *a], check=True, capture_output=True,
                       env={'GIT_AUTHOR_NAME': 't', 'GIT_AUTHOR_EMAIL': 't@x.invalid', 'HOME': str(tmp_path),
                            'GIT_COMMITTER_NAME': 't', 'GIT_COMMITTER_EMAIL': 't@x.invalid', 'PATH': '/usr/bin:/bin'})
    git('init', '-q')
    git('commit', '-q', '--allow-empty', '-m', 'start')
    return git


def test_pulled_counts_other_stations_commits_since_a_head(app_module, tmp_path):
    git = _repo(tmp_path)
    old = app_module._git_head(tmp_path)
    git('commit', '-q', '--allow-empty', '-m', 'a\n\nStation: s5')
    git('commit', '-q', '--allow-empty', '-m', 'b\n\nStation: s5')
    git('commit', '-q', '--allow-empty', '-m', 'mine\n\nStation: yoga')
    git('commit', '-q', '--allow-empty', '-m', 'untagged')
    assert app_module._pulled_since(tmp_path, old, own='yoga') == {'s5': 2, '(untagged)': 1}
    assert app_module._pulled_since(tmp_path, app_module._git_head(tmp_path), own='yoga') == {}


# ── item 4: automatic sync ────────────────────────────────────────────────────

def test_auto_sync_is_due_after_a_quiet_spell_following_a_write(app_module):
    due = app_module._auto_sync_due
    now = 10_000.0
    base = {'enabled': True, 'started': now - 3600, 'last': now - 60, 'last_ok': True, 'pending': None}
    assert not due({**base}, now), 'nothing written, synced a minute ago'
    assert not due({**base, 'pending': now - 10}, now), 'a write 10 s ago: wait for more'
    assert due({**base, 'pending': now - app_module.AUTO_SYNC_QUIET - 1}, now)
    assert due({**base, 'last': now - app_module.AUTO_SYNC_EVERY - 1}, now), 'pull now and then'
    assert due({**base, 'last': None, 'started': now - 20}, now), 'pull soon after the server starts'
    assert not due({**base, 'enabled': False, 'pending': now - 999, 'last': None}, now)


def test_auto_sync_after_a_failure_waits_longer(app_module):
    now = 10_000.0
    s = {'enabled': True, 'started': 0, 'last': now - 120, 'last_ok': False, 'pending': now - 999}
    assert not app_module._auto_sync_due(s, now), 'offline: do not retry every minute'
    assert app_module._auto_sync_due({**s, 'last': now - app_module.AUTO_SYNC_RETRY - 1}, now)


def test_a_write_marks_a_sync_pending_and_a_read_does_not(app_module, monkeypatch):
    monkeypatch.setitem(app_module._auto_sync, 'pending', None)
    app_module.run_task_command(['task', '_version'], readonly=True)
    assert app_module._auto_sync['pending'] is None
    app_module.run_task_command(['task', 'add', '--', 'sync me'])
    assert app_module._auto_sync['pending'] is not None


def test_auto_sync_tells_the_pages_what_came_in(app_module, gittw, monkeypatch):
    sent = []
    monkeypatch.setattr(app_module, '_sse_broadcast', sent.append)
    monkeypatch.setattr(app_module, '_pulled_since', lambda td, old, own: {'s5': 2})
    monkeypatch.setitem(app_module._auto_sync, 'pending', 1.0)
    app_module._auto_sync_run()
    assert sent == [{'type': 'synced', 'pulled': {'s5': 2}}]
    assert app_module._auto_sync['pending'] is None and app_module._auto_sync['last_ok'] is True


def test_auto_sync_quiet_when_nothing_came_in(app_module, gittw, monkeypatch):
    sent = []
    monkeypatch.setattr(app_module, '_sse_broadcast', sent.append)
    monkeypatch.setattr(app_module, '_pulled_since', lambda td, old, own: {})
    app_module._auto_sync_run()
    assert sent == []


def test_auto_sync_setting_defaults_on_and_saves(client, app_module, monkeypatch, tmp_path):
    monkeypatch.setattr(app_module, '_SETTINGS_PATH', tmp_path / 'settings.json')   # never the folder's
    assert app_module._load_settings()['sync_auto'] is True
    r = client.post('/api/config', headers=TRUSTED, json={'sync_auto': False})
    assert r.get_json()['success'] is True
    assert app_module._load_settings()['sync_auto'] is False


# ── the lock: a sync never runs while task does, and the other way round ──────

def test_a_sync_waits_for_task_commands_and_task_waits_for_a_sync(app_module):
    lock = app_module._data_lock
    order = []
    with lock.shared():
        t = threading.Thread(target=lambda: (lock.exclusive().__enter__(), order.append('sync'),
                                             lock.release_exclusive()))
        t.start()
        time.sleep(0.2)
        order.append('task done')
    t.join(2)
    assert order == ['task done', 'sync']

    with lock.exclusive():
        done = []
        t = threading.Thread(target=lambda: done.append(app_module.run_task_command(['task', '_version'],
                                                                                    readonly=True)))
        t.start()
        time.sleep(0.3)
        assert done == [], 'a task command ran during a sync'
    t.join(5)
    assert done and done[0]['success']


def test_task_commands_share_the_lock(app_module):
    lock = app_module._data_lock
    with lock.shared():
        assert app_module.run_task_command(['task', '_version'], readonly=True)['success']


# ── item 7: file links on Termux ──────────────────────────────────────────────

def test_open_uses_termux_open_without_xdg_open(client, app_module, monkeypatch, tmp_path):
    spawned = []
    monkeypatch.setattr(app_module.subprocess, 'Popen', lambda *a, **k: spawned.append(a[0]))
    monkeypatch.setattr(app_module.shutil, 'which', lambda name: '/p/bin/termux-open' if name == 'termux-open' else None)
    monkeypatch.setattr(app_module, '_open_allowed', lambda path, home: True)
    f = tmp_path / 'note.txt'
    f.write_text('x')
    r = client.post('/api/open', headers=TRUSTED, json={'path': str(f)})
    assert r.get_json()['success'] is True and spawned == [['termux-open', str(f)]]


def test_open_prefers_xdg_open(client, app_module, monkeypatch, tmp_path):
    spawned = []
    monkeypatch.setattr(app_module.subprocess, 'Popen', lambda *a, **k: spawned.append(a[0]))
    monkeypatch.setattr(app_module.shutil, 'which', lambda name: '/usr/bin/' + name)
    monkeypatch.setattr(app_module, '_open_allowed', lambda path, home: True)
    f = tmp_path / 'note.txt'
    f.write_text('x')
    client.post('/api/open', headers=TRUSTED, json={'path': str(f)})
    assert spawned == [['xdg-open', str(f)]]


def test_a_launcher_naming_xdg_open_uses_termux_open_where_that_is_all_there_is(app_module, monkeypatch):
    monkeypatch.setattr(app_module.shutil, 'which', lambda name: '/p/bin/termux-open' if name == 'termux-open' else None)
    assert app_module._launch_argv('xdg-open {value}', '/home/x/a.pdf') == ['termux-open', '/home/x/a.pdf']
    monkeypatch.setattr(app_module.shutil, 'which', lambda name: '/usr/bin/' + name)
    assert app_module._launch_argv('xdg-open {value}', '/home/x/a.pdf') == ['xdg-open', '/home/x/a.pdf']


# ── what a failed sync says, and a repo stuck mid-rebase ──────────────────────

def test_the_note_is_gits_telling_line_not_its_last(app_module):
    note = app_module._sync_note
    assert note("Pulling...\nERROR: Repository not found.\nfatal: Could not read from remote repository.\n\n"
                "Please make sure you have the correct access rights\nand the repository exists.") \
        == 'ERROR: Repository not found.'
    assert note('ssh: Could not resolve hostname codeberg.org: Name or service not known\nfatal: Could not read '
                'from remote repository.') == 'ssh: Could not resolve hostname codeberg.org: Name or service not known'
    assert note('error: could not apply 5bb6954... task: update branding\nhint: Resolve all conflicts') \
        == 'error: could not apply 5bb6954... task: update branding'
    assert note('gittw: the pull conflicted in config/x, which gittw can\'t merge; undone') .startswith('gittw: the pull')
    assert note('something odd\nlast line') == 'last line'
    assert note('') == ''


def test_status_says_when_the_repo_is_stuck_mid_rebase(client, gittw, tmp_path):
    assert client.get('/api/sync/status', headers=LOCAL).get_json()['rebase_stopped'] is False
    (tmp_path / '.git' / 'rebase-merge').mkdir()
    assert client.get('/api/sync/status', headers=LOCAL).get_json()['rebase_stopped'] is True
