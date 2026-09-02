#!/bin/bash
# Builds the store zip. Refuses rather than producing something broken:
# what gets reviewed is the zip, and every check below is here because the
# failure it catches is silent.
set -euo pipefail
cd "$(dirname "$0")"
VERSION=$(python3 -c "import json;print(json.load(open('chrome/manifest.json'))['version'])")
ZIP="dist/lightmorphic-sidebar-$VERSION.zip"

fail() { echo "REFUSING: $*" >&2; exit 1; }

[ -d dev ] && fail "dev/ exists - remove the preview stub before packaging."

if grep -rn "src=[\"']http\|url([\"']\?http\|@import.*http" chrome/ ; then
  fail "a remote asset is referenced above."
fi

# Developer leftovers that must never ship.
if find chrome -name '*.map' -o -name '.DS_Store' -o -name 'dev-*' | grep -q .; then
  find chrome -name '*.map' -o -name '.DS_Store' -o -name 'dev-*'
  fail "a developer-only file is inside chrome/."
fi

# Every script must parse. A rename once shipped a content script with a
# hyphen in an identifier; it failed silently on every page.
for j in $(find chrome -name '*.js'); do
  node --check "$j" >/dev/null || fail "$j does not parse."
done

# Every file the manifest names must exist.
python3 - <<'PY' || exit 1
import json, pathlib, sys
m = json.load(open("chrome/manifest.json"))
named = [m["background"]["service_worker"], m["side_panel"]["default_path"]]
named += list(m["icons"].values()) + list(m["action"]["default_icon"].values())
for war in m.get("web_accessible_resources", []):
    named += war["resources"]
missing = [n for n in named if not (pathlib.Path("chrome") / n).exists()]
if missing:
    print("REFUSING: the manifest names files that do not exist:", missing, file=sys.stderr)
    sys.exit(1)
PY

# Manrope is bundled, and the SIL Open Font License asks for its text to
# travel with the font.
[ -f chrome/fonts/OFL.txt ] || fail "chrome/fonts/OFL.txt is missing; the bundled font's licence must ship."

# The extension finds a user's existing data by the name it had before the
# rename. Blanket find-and-replace over these orphans every existing user's
# saved work, and nothing errors - the panel simply comes up empty.
grep -q 'OLD_ROOT_TITLES' chrome/lib/store.js || fail "the rename migration constants are gone from lib/store.js."
grep -q 'sidemorphic.invalid' chrome/lib/store.js || fail "the old data prefix is gone from lib/store.js."

mkdir -p dist
rm -f "$ZIP"
( cd chrome && zip -qr "../$ZIP" . -x '.*' )
echo "$ZIP"
unzip -l "$ZIP" | tail -1
