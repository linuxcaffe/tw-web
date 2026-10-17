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
