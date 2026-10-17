"""The pages' pure-JS unit tests (tests/js/*.test.cjs), run in Node; and tw-filter.js wiring."""
import shutil
import subprocess
from pathlib import Path

import pytest

JS = Path(__file__).resolve().parent / 'js'
TEST = JS / 'tw-filter.test.cjs'


@pytest.mark.skipif(not shutil.which('node'), reason='node not installed')
@pytest.mark.parametrize('test', sorted(JS.glob('*.test.cjs')), ids=lambda p: p.name)
def test_js(test):
    out = subprocess.run(['node', str(test)], capture_output=True, text=True, timeout=30)
    assert out.returncode == 0, out.stdout + out.stderr


# Scripts that use TW.filter only behind a guard, at call time. nav.js (every page, loaded before
# tw-filter.js) reads virtual tags into TW.filter where the page has it, and skips them elsewhere.
GUARDED = {'nav.js'}


def test_pages_using_tw_filter_load_it():
    # check-refs tracks top-level names only, so it can't see TW.filter / TW.sort: check here
    # that every page whose scripts use them loads tw-filter.js after tw-api.js and before them.
    import importlib.util
    root = TEST.parents[2]
    spec = importlib.util.spec_from_file_location('check_refs', root / '.tools' / 'check-refs.py')
    refs = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(refs)
    for page in sorted(root.glob('*.html')):
        units = [u for u in refs.page_units(page, root) if isinstance(u, str)]
        users = [u for u in units if u != 'tw-filter.js' and u not in GUARDED
                 and ('TW.filter' in (root / u).read_text() or 'TW.sort' in (root / u).read_text())]
        if not users:
            continue
        assert 'tw-filter.js' in units, f'{page.name} uses TW.filter/TW.sort ({users}) without tw-filter.js'
        at = units.index('tw-filter.js')
        assert units.index('tw-api.js') < at < min(units.index(u) for u in users), f'{page.name}: load order'
