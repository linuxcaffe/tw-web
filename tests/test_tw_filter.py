"""tw-filter.js unit tests (tests/js/tw-filter.test.cjs), run in Node."""
import shutil
import subprocess
from pathlib import Path

import pytest

TEST = Path(__file__).resolve().parent / 'js' / 'tw-filter.test.cjs'


@pytest.mark.skipif(not shutil.which('node'), reason='node not installed')
def test_tw_filter_js():
    out = subprocess.run(['node', str(TEST)], capture_output=True, text=True, timeout=30)
    assert out.returncode == 0, out.stdout + out.stderr


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
        users = [u for u in units if u != 'tw-filter.js'
                 and ('TW.filter' in (root / u).read_text() or 'TW.sort' in (root / u).read_text())]
        if not users:
            continue
        assert 'tw-filter.js' in units, f'{page.name} uses TW.filter/TW.sort ({users}) without tw-filter.js'
        at = units.index('tw-filter.js')
        assert units.index('tw-api.js') < at < min(units.index(u) for u in users), f'{page.name}: load order'
