#!/usr/bin/env bash
# Builds dist/TimesheetStudio.html (offline web version) and dist/TimesheetStudio.exe (Windows app).
# Needs Node.js 18+ and Go 1.22+. Run from anywhere.
set -euo pipefail
cd "$(dirname "$0")"
(cd web && [ -d node_modules ] || npm ci --silent)
node web/build.mjs
node --test tests/*.test.js
cd launcher
if command -v go-winres >/dev/null 2>&1 || [ -x "$HOME/go/bin/go-winres" ]; then
  "$(command -v go-winres || echo "$HOME/go/bin/go-winres")" make --in winres/winres.json --arch amd64
fi
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H=windowsgui" -o ../dist/TimesheetStudio.exe .
echo "Done: dist/TimesheetStudio.exe and dist/TimesheetStudio.html"
