#!/usr/bin/env bash
# sync-assets.sh — copy the PREBUILT GIMS front-end assets into this demo's static/ mirror.
# The demo ships these committed (React is externalized at build time; we never rebuild here).
# Re-run after the GIMS front end changes:  GIMS_SRC=/path/to/GIMS-Project ./sync-assets.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GIMS_SRC="${GIMS_SRC:-$HERE/../GIMS-Project}"
[ -d "$GIMS_SRC/static/lib" ] || { echo "GIMS_SRC not found: $GIMS_SRC"; exit 1; }

LIB=( vendor.js glide-vendor.js glide-vendor.css data_grid.js tour.js tour.css
      noun_configure.js adjective_editor.js verb_editor.js noun_workbench.js runlog_workbench.js )
STYLES=( watery.css shell.css components.css
         noun_configure.css adjective_editor.css verb_editor.css noun_workbench.css runlog_workbench.css )

for f in "${LIB[@]}";    do cp -f "$GIMS_SRC/static/lib/$f"    "$HERE/static/lib/$f"; done
for f in "${STYLES[@]}"; do cp -f "$GIMS_SRC/static/styles/$f" "$HERE/static/styles/$f"; done
cp -f "$GIMS_SRC/static/icons.svg"               "$HERE/static/icons.svg"
cp -f "$GIMS_SRC/static/images/Transparent Gnome.png" "$HERE/static/images/gnome.png"
echo "[sync] copied $(( ${#LIB[@]} + ${#STYLES[@]} + 2 )) assets into static/ from $GIMS_SRC"
