#!/bin/bash

# SPDX-FileCopyrightText: 2017-2021 City of Espoo
#
# SPDX-License-Identifier: LGPL-2.1-or-later

set -euo pipefail

if [ "${DEBUG:-false}" = "true" ]; then
    set -x
fi

export CI="${CI:-false}"
export FORCE_COLOR=1
export PROXY_URL=${PROXY_URL:-http://localhost:9099}
export DUMMY_IDP_URL=${DUMMY_IDP_URL:-http://localhost:9090}

cd /repo/frontend
yarn set version self
yarn install --immutable
yarn exec playwright install

echo 'INFO: Waiting for compose stack to be up ...'
wait-for-url.sh "${PROXY_URL}/api/dev-api/"
wait-for-url.sh "${DUMMY_IDP_URL}/health" "200"

echo "Running tests ..."

if test -f playwright-filenames.txt; then
    mapfile -t FILENAMES < playwright-filenames.txt
    yarn e2e-ci "${FILENAMES[@]}"
else
    yarn e2e-ci "src/e2e-test/specs/"
fi
