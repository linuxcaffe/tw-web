"""
pytest fixtures for tw-web.

app.py runs `task` at import time and captures os.environ into _TW_ENV, so the
throwaway task database must be in place BEFORE app is imported. Every test
session gets its own TASKRC / data.location in a temp directory, with hooks
off. The real ~/.task is never touched; the guard below fails the run if it
would be.
"""
import os
import sys
import tempfile
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent

_tmp = Path(tempfile.mkdtemp(prefix='tw-web-test-'))
(_tmp / 'data').mkdir()
(_tmp / 'taskrc').write_text(
    f'data.location={_tmp / "data"}\n'
    'hooks=off\n'
    'confirmation=no\n'
    'verbose=nothing\n'
    # Holidays as tw-events writes them (tests/test_holidays.py reads them back)
    'holiday.hd20261012a.name=Thanksgiving Day\n'
    'holiday.hd20261012a.date=20261012\n'
    'holiday.hd20261012a.type=V\n'
    'holiday.hd20261012a.region=ON\n'
    'holiday.hd20261224a.name=Winter Break\n'
    'holiday.hd20261224a.start=20261224\n'
    'holiday.hd20261224a.end=20261226\n'
    # The sky, as tw-events writes it: .kind and .at (the moment, UTC)
    'holiday.mn20261026a.name=Full Moon\n'
    'holiday.mn20261026a.date=20261026\n'
    'holiday.mn20261026a.kind=moon\n'
    'holiday.mn20261026a.at=20261026T041142Z\n'
)
os.environ['TASKRC'] = str(_tmp / 'taskrc')
os.environ['TASKDATA'] = str(_tmp / 'data')
# Private runtime dir (hook prompts, spool, PID) — never the live server's.
(_tmp / 'run').mkdir(mode=0o700)
os.environ['XDG_RUNTIME_DIR'] = str(_tmp / 'run')
# Network settings under test are passed explicitly; don't inherit the shell's.
for _k in ('TW_WEB_HOST', 'TW_WEB_TAILSCALE', 'TW_WEB_DEBUG', 'TW_WEB_ALLOWED_HOSTS'):
    os.environ.pop(_k, None)

_real = Path.home() / '.task'
assert not os.environ['TASKDATA'].startswith(str(_real)), 'tests must not use ~/.task'

sys.path.insert(0, str(REPO))
os.chdir(REPO)   # app.py serves static files relative to cwd

import app as tw_app  # noqa: E402  (must follow the env setup above)


@pytest.fixture
def app_module():
    return tw_app


@pytest.fixture
def client():
    tw_app.app.config['TESTING'] = True
    return tw_app.app.test_client()


@pytest.fixture
def captured(app_module, monkeypatch):
    """Record the argv each run_task_command call would send to `task`; nothing runs."""
    calls = []
    def fake(args, readonly=False, extra_overrides=None, extra_env=None):
        calls.append(list(args))
        return {'success': True, 'stdout': '[]', 'stderr': ''}
    monkeypatch.setattr(app_module, 'run_task_command', fake)
    return calls
