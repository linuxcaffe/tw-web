"""
S6: task fields rendered into HTML must be escaped.

No JS test harness exists yet (phase 3), so this is a source check: in the
calendar's task-detail table, every ${...} interpolation must go through
escHtml() or be a number. Task text (project, tags, UDAs) is user data and
can arrive from outside (ical hook, bookmarks, sync); unescaped, it runs as
script on tw-web's origin, which can open the terminal.
"""
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
_INTERP = re.compile(r'\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}')


def _detail_rows():
    src = (REPO / 'calendar-planner.js').read_text()
    return [l for l in src.splitlines() if 'rows.push(' in l]


def test_detail_rows_found():
    assert len(_detail_rows()) >= 8


def test_detail_rows_escape_every_value():
    bad = []
    for line in _detail_rows():
        for expr in _INTERP.findall(line):
            expr = expr.strip()
            if expr.startswith('escHtml(') or expr.startswith('Number('):
                continue
            # tags are joined from inner templates; check those separately
            if expr.startswith('task.tags.map('):
                if '${escHtml(t)}' not in expr:
                    bad.append(expr)
                continue
            bad.append(expr)
    assert not bad, f'unescaped values in calendar task detail: {bad}'


def test_eschtml_escapes_angle_brackets():
    src = (REPO / 'calendar-planner.js').read_text()
    body = re.search(r'function escHtml\(s\) \{(.*?)\n\}', src, re.S)
    assert body, 'escHtml() missing'
    for ch in ('&amp;', '&lt;', '&gt;', '&quot;'):
        assert ch in body.group(1)
