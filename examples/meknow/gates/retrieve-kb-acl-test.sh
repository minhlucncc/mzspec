#!/usr/bin/env bash
# Runs the cross-tenant + ACL-filter tests for retrieve_kb.
# Usage: retrieve-kb-acl-test.sh
set -euo pipefail

uv --directory packages/rag-core run pytest -q \
  -k "retrieve_kb and (isolation or acl_filter or alignment)"
