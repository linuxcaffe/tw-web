"""tw-nb-interop M7 (a), tw-web's side: what of nb is here, asked before acting (djp 2026-11-04).

GET /api/nb/health: `nb` (found), the nb-plugin tw (found: a dangling link isn't), a tasknotes
notebook, the ~/.task/notes link (to the tasknotes folder: tw-web's read-only view needs it),
termux-open (Android: Documents opens a note), and nb-web's address from the `nb` annotation
launcher ('' when that isn't a web address). Whether nb-web answers is the browser's to find out
(TW.nbHealth): the launcher is the browser's address. The phone's scenarios (djp): tw-web local
with nb-web over Tailscale, with nb + Documents, with nb alone; task2 + nb.
"""
import pytest


@pytest.fixture
def station(app_module, tmp_path, monkeypatch):
    """A station's HOME: ~/.nb and ~/.task under tmp_path; nothing found unless a test adds it."""
    home = tmp_path / 'home'
    (home / '.nb').mkdir(parents=True)
    (home / '.task').mkdir()
    monkeypatch.setenv('HOME', str(home))
    monkeypatch.delenv('NB_DIR', raising=False)
    monkeypatch.delenv('TW_TASK_DIR', raising=False)
    monkeypatch.setenv('PATH', str(tmp_path / 'bin'))
    (tmp_path / 'bin').mkdir()
    monkeypatch.setattr(app_module, '_load_settings', lambda: {'annotation_launchers': {
        'nb': 'http://localhost:5080/#{value}', 'file': 'xdg-open {value}'}})
    return home


def _tool(home, name):
    p = home.parent / 'bin' / name
    p.write_text('#!/bin/sh\n')
    p.chmod(0o755)


def health(client):
    r = client.get('/api/nb/health')
    assert r.status_code == 200
    return r.get_json()


def test_nothing_here(client, station):
    d = health(client)
    assert d['nb'] == {'ok': False} and d['plugin'] == {'ok': False}
    assert d['tasknotes'] == {'ok': False} and d['notes'] == {'ok': False, 'path': ''}
    assert d['termux_open'] == {'ok': False}
    assert d['nb_web_url'] == 'http://localhost:5080/'


def test_a_full_station(client, station):
    _tool(station, 'nb')
    _tool(station, 'termux-open')
    nb = station / '.nb'
    (nb / '.plugins').mkdir()
    (nb / '.plugins' / 'tw.nb-plugin').write_text('# tw\n')
    (nb / 'tasknotes' / '.git').mkdir(parents=True)
    (station / '.task' / 'notes').symlink_to('../.nb/tasknotes')
    d = health(client)
    assert d['nb']['ok'] and d['plugin']['ok'] and d['tasknotes']['ok'] and d['termux_open']['ok']
    assert d['notes'] == {'ok': True, 'path': str(nb / 'tasknotes')}


def test_a_dangling_plugin_link_is_missing(client, station):
    (station / '.nb' / '.plugins').mkdir()
    (station / '.nb' / '.plugins' / 'tw.nb-plugin').symlink_to(station / 'gone')
    assert health(client)['plugin'] == {'ok': False}


def test_a_dangling_notes_link_is_missing(client, station):
    (station / '.task' / 'notes').symlink_to('../.nb/tasknotes')   # no tasknotes notebook (yet)
    assert health(client)['notes'] == {'ok': False, 'path': ''}


@pytest.mark.parametrize('template, url', [
    ('http://100.99.171.77:5001/#{value}', 'http://100.99.171.77:5001/'),
    ('https://nb.example.org/nb/#{value}', 'https://nb.example.org/nb/'),
    ('xdg-open {value}', ''),
    ('', ''),
])
def test_nb_web_url_from_the_launcher(client, station, app_module, monkeypatch, template, url):
    monkeypatch.setattr(app_module, '_load_settings', lambda: {'annotation_launchers': {'nb': template}})
    assert health(client)['nb_web_url'] == url
