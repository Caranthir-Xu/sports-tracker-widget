#!/bin/sh
# Deploy the data layer outside ~/Documents and (re)load the launchd agent.
#
# Why: macOS privacy (TCC) blocks launchd jobs from reading ~/Documents, so the
# scheduled job runs from a runtime copy in ~/Library/Application Support.
# Re-run this after editing fetch.py, providers/ or config.yaml.
#
# Usage: ./launchd/install.sh          deploy + load
#        ./launchd/install.sh remove   unload + delete runtime copy
set -e
LABEL=com.adaxu.sports-tracker
PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME="$HOME/Library/Application Support/sports-tracker"
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [ "$1" = "remove" ]; then
  rm -f "$DEST"
  rm -rf "$RUNTIME"
  echo "removed $LABEL and $RUNTIME"
  exit 0
fi

# Copy code + config (data.json in RUNTIME is kept, so stale fallback survives).
mkdir -p "$RUNTIME/logs"
rsync -a --delete --exclude __pycache__ "$PROJECT/providers/" "$RUNTIME/providers/"
cp "$PROJECT/fetch.py" "$PROJECT/config.yaml" "$PROJECT/requirements.txt" "$RUNTIME/"

# Own venv: a venv can't be copied (absolute paths) and the project one is in ~/Documents.
if [ ! -x "$RUNTIME/.venv/bin/python" ]; then
  /usr/bin/python3 -m venv "$RUNTIME/.venv"
fi
"$RUNTIME/.venv/bin/pip" install -q --disable-pip-version-check -r "$RUNTIME/requirements.txt"

# launchd needs a real file with absolute paths.
sed "s#__RUNTIME__#$RUNTIME#g" "$PROJECT/launchd/$LABEL.plist.template" > "$DEST"
launchctl bootstrap "gui/$(id -u)" "$DEST"
echo "deployed to $RUNTIME"
echo "loaded $LABEL (runs now, then every 30 min)"
