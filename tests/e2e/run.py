#!/usr/bin/env python3
"""Headless page checks for tw-web, against a scratch server only.

    python3 tests/e2e/run.py            # every *.check.cjs
    python3 tests/e2e/run.py bug01 kb   # only checks whose name contains one of these

Brings up .tools/scratch-server.sh for this folder (throwaway TASKRC/TASKDATA/runtime dir,
free port), and before each check wipes the throwaway database and seeds it again, so checks
never see each other's writes. The server always comes down, even on Ctrl-C. Never touches
port 5000, ~/.task or the live runtime dir: lib.cjs refuses to open a page otherwise.

Each check exits 0 (pass), 1 (an expectation failed) or 2 (the check itself broke).
xfail.txt lists checks that reproduce a known bug and are expected to exit 1 until it is
fixed. An xfail check that passes is reported as XPASS and fails the run: remove its line.
Needs Playwright (see lib.cjs for where it is looked up) and its Chromium.
"""
import os
import shlex
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SCRATCH = ROOT / '.tools' / 'scratch-server.sh'

# UDAs and a context the views rely on; appended to the throwaway taskrc.
TASKRC_EXTRA = """\
uda.state.type=string
uda.sched_duration.type=duration
uda.due_duration.type=duration
uda.priority.values=1,2,3,4,5,6,H,M,L,
context.work.read=project:work
context.either.read=description.has:'(alpha|beta)' or project:nowhere
report.mine.columns=id,description
report.mine.filter=status:pending
alias.zz=information
"""

# IDs 1..7 in this order. 'today' is midnight, so these times all fall on today.
SEED = [
    ['add', 'alpha work task',   'project:work'],
    ['add', 'beta home due',     'project:home', 'due:today+20h'],
    ['add', 'gamma home sched',  'project:home', 'scheduled:today+10h'],
    ['add', 'delta home kanban', 'project:home', 'state:todo'],
    ['add', 'epsilon work secs', 'project:work', 'due:2030-12-01T12:00:30'],
    ['add', 'zeta work kanban',  'project:work', 'state:todo'],
    ['add', 'omega home due',      'project:home', 'due:today+21h'],
]


def scratch(*args):
    return subprocess.run([str(SCRATCH), *args, str(ROOT)], capture_output=True, text=True)


def scratch_env():
    """Parse `scratch-server.sh env` (export K=V …) into a dict."""
    out = scratch('env')
    if out.returncode:
        sys.exit(out.stderr.strip())
    env = {}
    for word in shlex.split(out.stdout)[1:]:
        k, _, v = word.partition('=')
        env[k] = v
    return env


def safe(env):
    home_task = str(Path.home() / '.task')
    return (env.get('TW_WEB_PORT') not in (None, '', '5000')
            and '/tw-web-scratch.' in env.get('TASKRC', '')
            and not env.get('TASKDATA', '').startswith(home_task)
            and '/tw-web-scratch.' in env.get('TW_WEB_SETTINGS', ''))   # its own settings.json


def reseed(env):
    data = Path(env['TASKDATA'])
    for f in data.glob('*.data'):
        f.unlink()
    for args in SEED:
        subprocess.run(['task', 'rc.verbose=nothing', *args], env=env, check=True,
                       capture_output=True)


def xfails():
    out = {}
    path = HERE / 'xfail.txt'
    for line in path.read_text().splitlines() if path.exists() else []:
        name, _, why = line.partition('#')
        if name.strip():
            out[name.strip()] = why.strip()
    return out


def main(argv):
    checks = sorted(HERE.glob('*.check.cjs'))
    if argv:
        checks = [c for c in checks if any(a in c.name for a in argv)]
    if not checks:
        sys.exit('e2e: no checks match')
    expected = xfails()

    up = scratch('up')
    if up.returncode:
        sys.exit('e2e: ' + (up.stderr.strip() or up.stdout.strip()))
    results = []
    try:
        env = {**os.environ, **scratch_env()}
        if not safe(env):
            sys.exit(f"e2e: refusing: not a scratch server ({env.get('TW_WEB_PORT')}, {env.get('TASKRC')})")
        with open(env['TASKRC'], 'a') as f:
            f.write(TASKRC_EXTRA)
        for check in checks:
            name = check.name[:-len('.check.cjs')]
            reseed(env)
            try:
                p = subprocess.run(['node', str(check)], env=env, capture_output=True,
                                   text=True, timeout=120)
                code, out = p.returncode, (p.stdout + p.stderr).strip()
            except subprocess.TimeoutExpired:
                code, out = 2, 'timed out after 120 s'
            if code == 0:
                status = 'XPASS' if name in expected else 'pass'
            elif code == 1 and name in expected:
                status = 'xfail'
            else:
                status = 'FAIL' if code == 1 else 'ERROR'
            results.append((status, name, out.splitlines()[-1] if out else ''))
            print(f'{status:6} {name}' + (f'  ({expected[name]})' if name in expected else ''))
            if status in ('FAIL', 'ERROR', 'XPASS') and out:
                print('       ' + out.replace('\n', '\n       '))
            elif status == 'xfail' and out:
                print('       ' + out.splitlines()[-1])
    finally:
        down = scratch('down')
        if down.returncode:
            print('e2e: scratch server did not come down cleanly:', down.stderr.strip(), file=sys.stderr)

    bad = [r for r in results if r[0] in ('FAIL', 'ERROR', 'XPASS')]
    counts = {s: sum(1 for r in results if r[0] == s) for s in ('pass', 'xfail', 'FAIL', 'ERROR', 'XPASS')}
    print('e2e: ' + ', '.join(f'{n} {s}' for s, n in counts.items() if n))
    if any(r[0] == 'XPASS' for r in bad):
        print('e2e: an XPASS means the bug is fixed: remove its line from tests/e2e/xfail.txt')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
