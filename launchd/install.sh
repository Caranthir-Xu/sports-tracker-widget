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
LABELS="$LABEL $LABEL.live"   # 30-min snapshot + 20-s live scores
PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME="$HOME/Library/Application Support/sports-tracker"

for L in $LABELS; do launchctl bootout "gui/$(id -u)/$L" 2>/dev/null || true; done
if [ "$1" = "remove" ]; then
  for L in $LABELS; do rm -f "$HOME/Library/LaunchAgents/$L.plist"; done
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

# launchd needs real files with absolute paths.
for L in $LABELS; do
  sed "s#__RUNTIME__#$RUNTIME#g" "$PROJECT/launchd/$L.plist.template" > "$HOME/Library/LaunchAgents/$L.plist"
  launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/$L.plist"
done
echo "deployed to $RUNTIME"
echo "loaded $LABEL (now + every 30 min) and $LABEL.live (every 20 s)"
