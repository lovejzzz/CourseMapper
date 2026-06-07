#!/bin/zsh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

export COURSEMAPPER_API_ENV="${COURSEMAPPER_API_ENV:-$REPO/API-dontComit/api.ev}"

npm run quality:browser:nightly -- "$@"
