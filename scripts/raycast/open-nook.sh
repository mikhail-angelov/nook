#!/bin/zsh

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Open Nook
# @raycast.mode silent

# Optional parameters:
# @raycast.packageName Nook
# @raycast.icon 📓
# @raycast.description Bring Nook to the front
# @raycast.author Mikhail Angelov

APP_PATH="${NOOK_APP_PATH:-/Applications/nook.app}"
APP_NAME="${NOOK_APP_NAME:-nook}"

if [[ -d "$APP_PATH" ]]; then
  open "$APP_PATH"
else
  open -a "$APP_NAME"
fi

osascript -e "tell application \"$APP_NAME\" to activate"
