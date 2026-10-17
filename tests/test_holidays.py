"""/api/holidays: the CLI's holiday.* entries (tw-events writes them), read with `task _show`.

tw-web never fetches holidays itself: the taskrc is the source, so `task calendar` and tw-web
show the same days (tw:docs/tw-holidays-and-layers-plan.md).
"""
import pytest


def fake_show(app_module, monkeypatch, text):
    calls = []
    def fake(args, readonly=False, extra_overrides=None, extra_env=None):
        calls.append((list(args), readonly))
        return {'success': True, 'stdout': text, 'stderr': ''}
    monkeypatch.setattr(app_module, 'run_task_command', fake)
    return calls


def test_reads_the_real_taskrc(client):
    r = client.get('/api/holidays?start=20261001&end=20261231').get_json()
    assert r['success']
    H = {'kind': 'holiday', 'at': ''}
    assert r['holidays'] == [
        {'start': '20261012', 'end': '20261012', 'title': 'Thanksgiving Day', 'type': 'V', 'region': 'ON', **H},
        {'start': '20261026', 'end': '20261026', 'title': 'Full Moon', 'type': '', 'region': '',
         'kind': 'moon', 'at': '20261026T041142Z'},
        {'start': '20261224', 'end': '20261226', 'title': 'Winter Break', 'type': '', 'region': '', **H},
    ]


def test_read_only_without_context(client, app_module, monkeypatch):
    calls = fake_show(app_module, monkeypatch, '')
    client.get('/api/holidays')
    assert calls == [(['task', 'rc.context=none', '_show'], True)]


@pytest.mark.parametrize('start,end,titles', [
    ('20261013', '20261223', ['Full Moon']),
    ('20261226', '20261231', ['Winter Break']),          # a range overlapping the start
    ('20261012', '20261012', ['Thanksgiving Day']),
    ('', '', ['Thanksgiving Day', 'Full Moon', 'Winter Break']),
])
def test_range_filter(client, start, end, titles):
    r = client.get(f'/api/holidays?start={start}&end={end}').get_json()
    assert [h['title'] for h in r['holidays']] == titles


def test_bad_range_is_refused(client):
    assert client.get('/api/holidays?start=2026-10-01').status_code == 400


def test_dateformat_holiday_and_any_key(client, app_module, monkeypatch):
    fake_show(app_module, monkeypatch, '\n'.join([
        'dateformat.holiday=D.M.Y',
        'holiday.Neujahr.name=Neujahr',
        'holiday.Neujahr.date=01.01.2027',
        'holiday.broken.name=No date',
        'holiday.half.date=02.01.2027',
        'holiday.bad.name=Bad',
        'holiday.bad.date=yesterday',
    ]))
    r = client.get('/api/holidays').get_json()
    assert r['holidays'] == [{'start': '20270101', 'end': '20270101', 'title': 'Neujahr',
                              'type': '', 'region': '', 'kind': 'holiday', 'at': ''}]


def test_short_letters(client, app_module, monkeypatch):
    fake_show(app_module, monkeypatch, 'dateformat.holiday=m/d/y\n'
              'holiday.x.name=X\nholiday.x.start=7/4/27\nholiday.x.end=7/5/27\n')
    r = client.get('/api/holidays').get_json()
    assert (r['holidays'][0]['start'], r['holidays'][0]['end']) == ('20270704', '20270705')


# ── settings: cal_holidays (Calendar and Agenda), agenda_holiday_days ─────────

ORIGIN = {'Origin': 'http://localhost'}


@pytest.fixture
def settings_file(app_module, monkeypatch, tmp_path):
    path = tmp_path / 'settings.json'
    monkeypatch.setattr(app_module, '_SETTINGS_PATH', path)
    return path


def test_setting_defaults(client, settings_file):
    cfg = client.get('/api/config').get_json()
    assert cfg['cal_holidays'] is True and cfg['agenda_holiday_days'] == 30
    assert cfg['cal_moon'] is True and cfg['cal_seasons'] is True


def test_setting_save(client, settings_file):
    r = client.post('/api/config', json={'cal_holidays': False, 'agenda_holiday_days': '60'},
                    headers=ORIGIN)
    assert r.get_json()['success'], r.get_json()
    cfg = client.get('/api/config').get_json()
    assert cfg['cal_holidays'] is False and cfg['agenda_holiday_days'] == 60


@pytest.mark.parametrize('patch', [{'cal_holidays': 'maybe'}, {'cal_moon': 'maybe'}, {'cal_seasons': 2}, {'agenda_holiday_days': -1},
                                   {'agenda_holiday_days': 400}])
def test_setting_refused(client, settings_file, patch):
    assert client.post('/api/config', json=patch, headers=ORIGIN).status_code == 400
