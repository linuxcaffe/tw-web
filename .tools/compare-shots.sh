#!/usr/bin/env bash
# Compare two folders of layout shots (tests/e2e/layout-shots-*.check.cjs with TW_E2E_SHOTS=<dir>),
# file by file: lists each shot that differs or is missing on one side, exits 1 if any did. Identical
# bytes, or no pixel more than 10% off (ImageMagick compare -fuzz: two runs of one commit differ by up
# to 20 antialiased pixels, a layout change by thousands), count as the same. Take both in one session,
# on one machine: the shots depend on its fonts.
#   TW_E2E_SHOTS=$tmp/before python3 tests/e2e/run.py layout-shots   # on main (both zooms)
#   TW_E2E_SHOTS=$tmp/after  python3 tests/e2e/run.py layout-shots   # on the branch
#   .tools/compare-shots.sh $tmp/before $tmp/after
set -u
command -v compare >/dev/null || { echo "$0: needs ImageMagick's compare" >&2; exit 2; }
[ $# -eq 2 ] && [ -d "$1" ] && [ -d "$2" ] || { echo "usage: $0 <before-dir> <after-dir>" >&2; exit 2; }
diffs=0 same=0
for f in $( (ls "$1"; ls "$2") | grep '\.png$' | sort -u); do
    if [ ! -f "$1/$f" ] || [ ! -f "$2/$f" ]; then echo "missing: $f"; diffs=$((diffs + 1))
    elif cmp -s "$1/$f" "$2/$f"; then same=$((same + 1))
    else
        px=$(compare -metric AE -fuzz 10% "$1/$f" "$2/$f" null: 2>&1)
        if [ "$px" = 0 ]; then same=$((same + 1)); else echo "differs: $f ($px pixels)"; diffs=$((diffs + 1)); fi
    fi
done
echo "$same same, $diffs different"
[ "$diffs" -eq 0 ]
