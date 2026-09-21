#!/bin/sh
set -eu
npm run build
node --check lite/lore-lite.js
node --check full/plugin/lore-full.js
git diff --exit-code -- lite/lore-lite.js full/plugin/lore-full.js
npm test
python3 -m unittest discover -s tests -p '*_test.py'
npm run test:browser
