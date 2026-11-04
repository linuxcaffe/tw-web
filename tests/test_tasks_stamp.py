"""
Bug 19 (djp 2026-11-04): a change made outside an open page (the CLI, vit, another tab, the
phone's sync, a later hook) never reached it. The server names the data files' state with a
stamp: it moves when the data does, every /api/ answer carries it (X-Tasks-Stamp, so a page
knows its own writes), and /api/ping has it (the fallback when the event stream slept). Found
from the taskrc's data.location, as task itself would (the session's TASKRC here, no TASKDATA).
"""
import os
import subprocess

import pytest


@pytest.fixture
def stamp(app_module, monkeypatch):
    monkeypatch.delenv('TASKDATA', raising=False)
    monkeypatch.setattr(app_module, '_data_dir_cache', None)
    return app_module._tasks_stamp


def test_the_data_dir_is_the_taskrc_s_data_location(app_module, stamp):
    stamp()
    assert app_module._data_dir() == app_module.Path(os.environ['TASKRC']).parent / 'data'


def test_the_stamp_moves_when_a_task_changes_elsewhere(stamp):
    before = stamp()
    subprocess.run(['task', 'rc.verbose=nothing', 'add', 'stamp probe'], check=True,
                   capture_output=True, stdin=subprocess.DEVNULL)
    assert stamp() != before
    assert stamp() == stamp()                    # and stays put while nothing changes


def test_answers_carry_the_stamp_and_the_ping_has_it(client, stamp):
    r = client.get('/api/ping')
    assert r.headers['X-Tasks-Stamp'] == r.get_json()['stamp'] == stamp()
    assert 'X-Tasks-Stamp' not in client.get('/').headers   # pages and files: no stat per request
