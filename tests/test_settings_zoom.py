"""Calendar zoom steps (cal_zoom): three per time-grid view, each a row size and a start hour,
plus which one the view opens at. Replaces cal_slot_duration and cal_scroll_time."""
import json

import pytest

ZOOM = {
    'week': {'steps': [['00:15', '08:00'], ['00:30', '08:00'], ['01:00', '00:00']], 'default': 1},
    'day':  {'steps': [['00:10', '07:00'], ['00:20', '06:00'], ['01:00', '00:00']], 'default': 0},
}


@pytest.fixture
def settings_file(app_module, monkeypatch, tmp_path):
    path = tmp_path / 'settings.json'
    monkeypatch.setattr(app_module, '_SETTINGS_PATH', path)
    return path


def test_default_zoom(client, settings_file):
    z = client.get('/api/config').get_json()['cal_zoom']
    for view in ('week', 'day'):
        assert len(z[view]['steps']) == 3
        assert z[view]['steps'][z[view]['default']] == ['00:30:00', '08:00:00']   # as before: 30 min at 08:00


def test_old_keys_are_gone(client, settings_file):
    cfg = client.get('/api/config').get_json()
    assert 'cal_slot_duration' not in cfg and 'cal_scroll_time' not in cfg


def test_save_and_normalise(client, settings_file):
    r = client.post('/api/config', json={'cal_zoom': ZOOM}, headers={'Origin': 'http://localhost'})
    assert r.get_json()['success'], r.get_json()
    saved = json.loads(settings_file.read_text())['cal_zoom']
    assert saved['week']['steps'][2] == ['01:00:00', '00:00:00']
    assert saved['day']['default'] == 0
    assert client.get('/api/config').get_json()['cal_zoom'] == saved


@pytest.mark.parametrize('bad', [
    {'week': {'steps': [['00:15', '08:00']] * 2, 'default': 0}, 'day': ZOOM['day']},       # two steps
    {'week': {'steps': [['00:07', '08:00']] * 3, 'default': 0}, 'day': ZOOM['day']},       # odd row size
    {'week': {'steps': [['00:15', '25:00']] * 3, 'default': 0}, 'day': ZOOM['day']},       # bad hour
    {'week': {'steps': [['00:15', '08:00']] * 3, 'default': 3}, 'day': ZOOM['day']},       # default out of range
    {'week': ZOOM['week']},                                                                 # day missing
])
def test_invalid_zoom_refused(client, settings_file, bad):
    r = client.post('/api/config', json={'cal_zoom': bad}, headers={'Origin': 'http://localhost'})
    assert r.status_code == 400
    assert not settings_file.exists()
