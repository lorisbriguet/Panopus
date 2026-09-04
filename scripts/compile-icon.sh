#!/bin/bash
# Compile the Icon Composer document (Icon/Panopus.icon) into the
# artifacts Tauri bundles:
#   - src-tauri/icons/Assets.car    -> macOS 26+ Liquid Glass icon
#   - src-tauri/icons/Panopus.icns  -> legacy icon (pre-Tahoe, Finder fallbacks)
# Requires Xcode 26+ (actool with .icon support).
# Run after editing Icon/Panopus.icon, then rebuild the app.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

xcrun actool Icon/Panopus.icon \
  --compile "$OUT" \
  --platform macosx \
  --minimum-deployment-target 11.0 \
  --app-icon Panopus \
  --include-all-app-icons \
  --output-partial-info-plist "$OUT/partial.plist" > /dev/null

cp "$OUT/Assets.car" src-tauri/icons/Assets.car
cp "$OUT/Panopus.icns" src-tauri/icons/Panopus.icns
echo "Compiled: src-tauri/icons/Assets.car + src-tauri/icons/Panopus.icns"
