#!/usr/bin/env python3
"""check-guards.py — fail if a load-bearing identifier listed in .guards is gone.

Large edits sometimes delete a function that other files, the fleet's hooks or the
security model depend on, and nothing notices until it's used. Each .guards line is
`file:identifier`; the identifier must still appear in the file, matched on word
boundaries so `def _is_asset` isn't satisfied by `def _is_asset_old`.

Usage: check-guards.py [repo-dir]. Exit 0 = all present, 1 = something is missing.
"""
import re
import sys
from pathlib import Path


def check(repo):
    guards = repo / '.guards'
    if not guards.is_file():
        return []
    missing = []
    for n, line in enumerate(guards.read_text().splitlines(), 1):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        name, _, ident = line.partition(':')
        path = repo / name
        if not path.is_file():
            missing.append(f'.guards:{n}: {name} not found')
            continue
        pat = (r'\b' if ident[0].isalnum() or ident[0] == '_' else '') + re.escape(ident) + \
              (r'\b' if ident[-1].isalnum() or ident[-1] == '_' else '')
        if not re.search(pat, path.read_text(encoding='utf-8', errors='replace')):
            missing.append(f'.guards:{n}: `{ident}` is missing from {name}')
    return missing


def main():
    repo = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent)
    missing = check(repo)
    for m in missing:
        print(f'GUARD FAIL  {m}', file=sys.stderr)
    if missing:
        print('If the removal was deliberate, update .guards in the same commit.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
