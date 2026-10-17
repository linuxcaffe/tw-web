"""Calendar daylight tint: on/off and the place (latitude, longitude; default Toronto)."""
import json

import pytest

ORIGIN = {'Origin': 'http://localhost'}


@pytest.fixture
def settings_file(app_module, monkeypatch, tmp_path):
    path = tmp_path / 'settings.json'
    monkeypatch.setattr(app_module, '_SETTINGS_PATH', path)
    return path


def test_defaults(client, settings_file):
    cfg = client.get('/api/config').get_json()
    assert cfg['cal_daylight'] is True
    assert (cfg['cal_latitude'], cfg['cal_longitude']) == (43.65, -79.38)


def test_save(client, settings_file):
    r = client.post('/api/config', json={'cal_daylight': False, 'cal_latitude': '51.5',
                                         'cal_longitude': -0.13}, headers=ORIGIN)
    assert r.get_json()['success'], r.get_json()
    saved = json.loads(settings_file.read_text())
    assert saved['cal_daylight'] is False and saved['cal_latitude'] == 51.5
    assert client.get('/api/config').get_json()['cal_longitude'] == -0.13


@pytest.mark.parametrize('patch', [{'cal_latitude': 91}, {'cal_latitude': 'north'},
                                   {'cal_longitude': -181}, {'cal_daylight': 'maybe'}])
def test_refused(client, settings_file, patch):
    assert client.post('/api/config', json=patch, headers=ORIGIN).status_code == 400


def test_settings_path_from_the_environment(tmp_path):
    # The scratch server keeps its settings in its temp dir (TW_WEB_SETTINGS), not next to app.py.
    # A subprocess: app reads it at import. It inherits conftest's throwaway TASKRC/TASKDATA.
    import os
    import subprocess
    import sys
    from pathlib import Path
    repo = Path(__file__).resolve().parent.parent
    code = 'import app; print(app._SETTINGS_PATH)'
    want = tmp_path / 'settings.json'
    out = subprocess.run([sys.executable, '-c', code], cwd=repo, capture_output=True, text=True,
                         env={**os.environ, 'TW_WEB_SETTINGS': str(want)}, timeout=30)
    assert out.stdout.strip().splitlines()[-1] == str(want), out.stdout + out.stderr
    out = subprocess.run([sys.executable, '-c', code], cwd=repo, capture_output=True, text=True,
                         env={k: v for k, v in os.environ.items() if k != 'TW_WEB_SETTINGS'}, timeout=30)
    assert out.stdout.strip().splitlines()[-1] == str(repo / 'settings.json'), out.stdout + out.stderr
