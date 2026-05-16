#!/bin/bash
set -e
cd ~/stockflow-wms
if [ -n "$1" ]; then
  cp "$1" index.html
fi
git add index.html
git commit -m "Update WMS app — $(date '+%Y-%m-%d %H:%M')"
git push origin main
echo "✓ Pushed! Vercel deploys in ~30 seconds."
