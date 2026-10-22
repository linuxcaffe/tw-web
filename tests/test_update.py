"""The update pill: /api/version (tw-web's own version, and how far behind its upstream it is) and
/api/update (git pull --ff-only, only on main with no local edits). Every test points _WEB_DIR at a
throwaway clone: nothing here fetches or pulls tw-web itself."""
import subprocess

import pytest

LOCAL = {'Host': 'localhost:5000'}
TRUSTED = {**LOCAL, 'Origin': 'http://localhost:5000'}
ENV = {'GIT_AUTHOR_NAME': 't', 'GIT_AUTHOR_EMAIL': 't@x.invalid', 'GIT_COMMITTER_NAME': 't',
       'GIT_COMMITTER_EMAIL': 't@x.invalid', 'PATH': '/usr/bin:/bin', 'HOME': '/nonexistent'}


def git(path, *args):
    return subprocess.run(['git', '-C', str(path), *args], check=True, capture_output=True, text=True, env=ENV).stdout


@pytest.fixture
def repos(app_module, monkeypatch, tmp_path):
    """remote ← web (the running copy) and dev (where new commits come from)."""
    remote, web, dev = tmp_path / 'remote.git', tmp_path / 'web', tmp_path / 'dev'
    subprocess.run(['git', 'init', '-q', '--bare', '-b', 'main', str(remote)], check=True, env=ENV)
    subprocess.run(['git', 'clone', '-q', str(remote), str(dev)], check=True, env=ENV, capture_output=True)
    (dev / 'app.py').write_text('v1\n')
    git(dev, 'add', '-A')
    git(dev, 'commit', '-qm', 'first')
    git(dev, 'tag', 'v2.0.0')
    git(dev, 'push', '-q', '--tags', 'origin', 'main')
    subprocess.run(['git', 'clone', '-q', str(remote), str(web)], check=True, env=ENV, capture_output=True)
    monkeypatch.setattr(app_module, '_WEB_DIR', web)
    monkeypatch.setattr(app_module, '_update_state', {'checked': None, 'ok': None})

    def publish(*subjects):
        for s in subjects:
            (dev / 'app.py').write_text((dev / 'app.py').read_text() + s + '\n')
            git(dev, 'commit', '-qam', s)
        git(dev, 'push', '-q', 'origin', 'main')
    return web, publish


def test_version_when_current(client, repos):
    d = client.get('/api/version', headers=LOCAL).get_json()
    assert d['version'] == 'v2.0.0' and d['behind'] == 0 and d['subjects'] == []


def test_version_after_a_fetch_says_what_is_new(client, app_module, repos):
    web, publish = repos
    publish('Calendar: a fix', 'Sync: a feature')
    assert client.get('/api/version', headers=LOCAL).get_json()['behind'] == 0, 'nothing fetched yet'
    assert app_module._fetch_web()
    d = client.get('/api/version', headers=LOCAL).get_json()
    assert d['behind'] == 2 and d['subjects'] == ['Sync: a feature', 'Calendar: a fix']
    assert d['can_update'] is True and d['checked'] is not None


def test_update_pulls_and_reports_the_new_version(client, app_module, repos):
    web, publish = repos
    publish('one', 'two')
    app_module._fetch_web()
    r = client.post('/api/update', headers=TRUSTED)
    d = r.get_json()
    assert r.status_code == 200 and d['success'] is True and d['version'] == 'v2.0.0-2'
    assert (web / 'app.py').read_text() == 'v1\none\ntwo\n'
    assert client.get('/api/version', headers=LOCAL).get_json()['behind'] == 0


def test_no_update_over_local_edits(client, app_module, repos):
    web, publish = repos
    publish('one')
    app_module._fetch_web()
    (web / 'app.py').write_text('my edit\n')
    d = client.get('/api/version', headers=LOCAL).get_json()
    assert d['can_update'] is False and 'local changes' in d['reason']
    r = client.post('/api/update', headers=TRUSTED)
    assert r.status_code == 409 and (web / 'app.py').read_text() == 'my edit\n'


def test_no_update_off_main(client, app_module, repos):
    web, publish = repos
    publish('one')
    app_module._fetch_web()
    git(web, 'checkout', '-q', '-b', 'topic')
    d = client.get('/api/version', headers=LOCAL).get_json()
    assert d['can_update'] is False and 'topic' in d['reason']
    assert client.post('/api/update', headers=TRUSTED).status_code == 409


def test_update_is_a_post_and_origin_checked(client, app_module, repos):
    web, publish = repos
    publish('one')
    app_module._fetch_web()
    r = client.post('/api/update', headers={**LOCAL, 'Origin': 'http://attacker.example'})
    assert r.status_code == 403 and (web / 'app.py').read_text() == 'v1\n'
    assert client.get('/api/update', headers=LOCAL).status_code in (404, 405)
    assert (web / 'app.py').read_text() == 'v1\n'


def test_version_without_git_says_so(client, app_module, monkeypatch, tmp_path):
    monkeypatch.setattr(app_module, '_WEB_DIR', tmp_path)
    d = client.get('/api/version', headers=LOCAL).get_json()
    assert d['version'] is None and d['can_update'] is False
