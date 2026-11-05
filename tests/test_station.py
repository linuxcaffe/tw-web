"""GET /api/station: this station's name (gittw.device), for the menu footer (djp 2026-11-05: "the
'David Patrick  nb-web  Sign out' footer nb-web has would be good for tw-web too"). tw-web has no
accounts; the station is the useful fact when two tw-webs (yoga's, the phone's) are a tap apart.
'' when it isn't named."""

LOCAL = {'Host': 'localhost:5000'}


def _task(app_module, monkeypatch, out, rc=0):
    calls = []
    def run(args, readonly=False, **k):
        calls.append((args, readonly))
        return {'success': rc == 0, 'stdout': out, 'stderr': '', 'returncode': rc}
    monkeypatch.setattr(app_module, 'run_task_command', run)
    return calls


def test_station_is_gittw_device(client, app_module, monkeypatch):
    calls = _task(app_module, monkeypatch, 's5\n')
    assert client.get('/api/station', headers=LOCAL).get_json() == {'station': 's5'}
    assert calls == [(['task', '_get', 'rc.gittw.device'], True)]


def test_unnamed_station_is_empty(client, app_module, monkeypatch):
    _task(app_module, monkeypatch, '\n')
    assert client.get('/api/station', headers=LOCAL).get_json() == {'station': ''}


def test_task_failing_is_empty_not_an_error(client, app_module, monkeypatch):
    _task(app_module, monkeypatch, 'boom', rc=1)
    r = client.get('/api/station', headers=LOCAL)
    assert r.status_code == 200 and r.get_json() == {'station': ''}
