#!/bin/sh
# Copy the Scriptable scripts into Scriptable's iCloud folder; they sync to the iPhone.
# Needs Scriptable opened once on the phone with iCloud Drive enabled for it.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Library/Mobile Documents/iCloud~dk~simonbs~Scriptable/Documents"
if [ ! -d "$DEST" ]; then
  echo "Scriptable iCloud folder not found: $DEST" >&2
  exit 1
fi
cp "$HERE/Sports Data.js" "$HERE/Sports Tracker.js" "$DEST/"
echo "copied to $DEST (syncs to iPhone in a few seconds)"
