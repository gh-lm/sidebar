#!/bin/bash
# Makes a numbered test copy at ~/Claude_Repos/sidebar-testbuild.
#
# Every run bumps the fourth part of the version and the name, so the card at
# chrome://extensions says which build is loaded without opening anything.
# Chrome allows four dot-separated numbers; the store only ever sees the
# first three, because the store build comes from package.sh, not this.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=$(pwd)
DEST=${1:-$HOME/Claude_Repos/sidebar-testbuild}
BASE=$(python3 -c "import json;print(json.load(open('chrome/manifest.json'))['version'])")
COUNTER=$DEST/.build-number
mkdir -p "$DEST"
N=$(( $(cat "$COUNTER" 2>/dev/null || echo 0) + 1 ))
echo "$N" > "$COUNTER"

rm -rf "$DEST/extension"
cp -r chrome "$DEST/extension"
python3 - "$DEST/extension/manifest.json" "$BASE" "$N" <<'PY'
import json, pathlib, sys
p, base, n = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
d = json.loads(p.read_text())
d["version"] = f"{base}.{n}"
d["name"] = f"Lightmorphic Sidebar (test {n})"
d["description"] = f"TEST BUILD {n}. " + d["description"]
p.write_text(json.dumps(d, indent=2) + "\n")
print(f"{d['name']}  version {d['version']}")
PY

# Only the current one, so there is never a question of which zip is which.
rm -f "$DEST"/lightmorphic-sidebar-test-*.zip
( cd "$DEST/extension" && zip -qr "../lightmorphic-sidebar-test-$N.zip" . -x '.*' )

# Keep the readme's headline in step with what was just built.
if [ -f "$DEST/README.md" ]; then
  python3 - "$DEST/README.md" "$N" <<'PY2'
import pathlib, re, sys
p, n = pathlib.Path(sys.argv[1]), sys.argv[2]
s = p.read_text()
s = re.sub(r"Lightmorphic Sidebar \(test \d+\)", f"Lightmorphic Sidebar (test {n})", s)
s = re.sub(r"version 1\.1\.1\.\d+", f"version 1.1.1.{n}", s)
p.write_text(s)
PY2
fi
echo "$DEST/extension"
