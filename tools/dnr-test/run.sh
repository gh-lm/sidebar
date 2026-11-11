#!/bin/bash
# Every check that an ordinary website is untouched by this extension.
set -euo pipefail
cd "$(dirname "$0")/.."
HERE=$(pwd)
REPO=${1:-$(cd .. && pwd)}
WORK=$HERE/store-shots/work
mkdir -p "$WORK/node"

export PUPPETEER_CACHE_DIR="$WORK/node/.cache"
cd "$WORK/node"
[ -d node_modules/puppeteer ] || { npm init -y >/dev/null 2>&1; npm install puppeteer --no-audit --no-fund >/dev/null; }
[ -d "$PUPPETEER_CACHE_DIR/chrome" ] || npx puppeteer browsers install chrome >/dev/null

cp "$HERE/dnr-test"/*.js .
: "${DISPLAY:=:0}"
export DISPLAY

fail=0
for probe in hygiene stripprobe panelprobe; do
  echo
  echo "######## $probe ########"
  rm -rf "$WORK/run-$probe"
  node "$probe.js" "$REPO" "$WORK/run-$probe" || fail=1
done

echo
[ $fail -eq 0 ] && echo "ALL CLEAR" || echo "SOMETHING FAILED -- read the output above"
exit $fail
