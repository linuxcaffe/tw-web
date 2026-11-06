"""tw-web.install clones from GitHub first, then Codeberg (djp 2026-11-05: GitHub is where everything
public lives; Codeberg is the backup). An update whose own remote doesn't answer tries the other
mirror, not a fixed one: a phone's clone from Codeberg falls back to GitHub, and the other way round.

A fake git records what it's asked; nothing is cloned or fetched."""
import os
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
GH = 'https://github.com/linuxcaffe/tw-web.git'
CB = 'https://codeberg.org/linuxcaffe/tw-web.git'

FAKE_GIT = r'''#!/usr/bin/env python3
import os, sys
from pathlib import Path
args = [a for a in sys.argv[1:]]
while args and args[0] == '-c':
    args = args[2:]
cwd = None
if args[:1] == ['-C']:
    cwd, args = args[1], args[2:]
with open(os.environ['GIT_LOG'], 'a') as f:
    f.write(' '.join(args) + '\n')
down = os.environ.get('DOWN', '').split()
if args[:1] == ['clone']:
    url, dest = args[-2], args[-1]
    if url in down:
        sys.exit(128)
    d = Path(dest); d.mkdir(parents=True, exist_ok=True)
    for name in ('app.py', 'README.md', 'requirements.txt'):
        (d / name).write_text('')
    sys.exit(0)
if args[:2] == ['remote', 'get-url']:
    print(os.environ.get('ORIGIN', '')); sys.exit(0)
if args[:2] == ['rev-parse', '--abbrev-ref']:
    print('main'); sys.exit(0)
if args[:1] == ['rev-parse']:
    print('abc123'); sys.exit(0)
if args[:1] == ['status']:
    sys.exit(0)
if args[:1] == ['pull']:
    url = next((a for a in args if a.startswith('http')), os.environ.get('ORIGIN', ''))
    sys.exit(128 if url in down else 0)
if args[:1] == ['describe']:
    sys.exit(1)
sys.exit(0)
'''


def _run(tmp_path, down='', origin='', clone_exists=False):
    home = tmp_path / 'home'
    (home / '.task' / 'config').mkdir(parents=True, exist_ok=True)
    bin_ = tmp_path / 'bin'
    bin_.mkdir(exist_ok=True)
    (bin_ / 'git').write_text(FAKE_GIT)
    (bin_ / 'git').chmod(0o755)
    log = tmp_path / 'git.log'
    if clone_exists:
        d = home / '.local' / 'share' / 'tw-web'
        d.mkdir(parents=True)
        (d / 'app.py').write_text('')
        (d / 'README.md').write_text('')
    env = {'PATH': f"{bin_}:{os.environ['PATH']}", 'HOME': str(home), 'GIT_LOG': str(log),
           'DOWN': down, 'ORIGIN': origin, 'TW_TASK_DIR': str(home / '.task')}
    r = subprocess.run(['bash', str(REPO / 'tw-web.install'), 'install'], capture_output=True,
                       text=True, timeout=120, env=env)
    return r, log.read_text().splitlines() if log.exists() else []


def _clones(calls):
    return [c.split()[-2] for c in calls if c.startswith('clone')]


def _pulls(calls):
    return [next((a for a in c.split() if a.startswith('http')), '(its own remote)')
            for c in calls if c.startswith('pull')]


def test_a_new_clone_comes_from_github_first(tmp_path):
    r, calls = _run(tmp_path)
    assert _clones(calls) == [GH], r.stdout + r.stderr


def test_github_down_then_codeberg(tmp_path):
    r, calls = _run(tmp_path, down=GH)
    assert _clones(calls) == [GH, CB], r.stdout + r.stderr


def test_a_codeberg_clone_whose_remote_is_down_falls_back_to_github(tmp_path):
    """The phone's clone came from Codeberg before this change."""
    r, calls = _run(tmp_path, down=CB, origin=CB, clone_exists=True)
    assert _pulls(calls) == ['(its own remote)', GH], r.stdout + r.stderr


def test_a_github_clone_whose_remote_is_down_falls_back_to_codeberg(tmp_path):
    r, calls = _run(tmp_path, down=GH, origin=GH, clone_exists=True)
    assert _pulls(calls) == ['(its own remote)', CB], r.stdout + r.stderr
