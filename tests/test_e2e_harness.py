"""The headless harness (tests/e2e/) must never reach the live server or ~/.task.

These run without a browser or a server: they pin the two guards (run.py's safe() and
lib.cjs's guard()) and keep xfail.txt in step with the checks that exist.
"""
import importlib.util
import os
import shutil
import subprocess
from pathlib import Path

import pytest

E2E = Path(__file__).resolve().parent / 'e2e'
spec = importlib.util.spec_from_file_location('e2e_run', E2E / 'run.py')
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

SCRATCH = {'TW_WEB_PORT': '40123', 'TASKRC': '/tmp/tw-web-scratch.abc/taskrc',
           'TASKDATA': '/tmp/tw-web-scratch.abc/data'}


def test_runner_accepts_a_scratch_server():
    assert run.safe(SCRATCH)


@pytest.mark.parametrize('patch', [
    {'TW_WEB_PORT': '5000'},
    {'TW_WEB_PORT': ''},
    {'TASKRC': str(Path.home() / '.taskrc')},
    {'TASKDATA': str(Path.home() / '.task')},
])
def test_runner_refuses_anything_else(patch):
    assert not run.safe({**SCRATCH, **patch})


@pytest.mark.skipif(not shutil.which('node'), reason='node not installed')
@pytest.mark.parametrize('patch', [{'TW_WEB_PORT': '5000'}, {'TASKRC': str(Path.home() / '.taskrc')}])
def test_a_check_refuses_before_opening_a_page(patch):
    env = {k: v for k, v in os.environ.items() if k not in SCRATCH}
    env.update({**SCRATCH, **patch})
    p = subprocess.run(['node', str(E2E / 'smoke-list.check.cjs')], env=env,
                       capture_output=True, text=True, timeout=30)
    assert p.returncode == 2 and 'not a scratch server' in p.stdout


def test_xfail_names_existing_checks():
    checks = {p.name[:-len('.check.cjs')] for p in E2E.glob('*.check.cjs')}
    assert set(run.xfails()) <= checks
