#!/usr/bin/env bash
# Asserts DEFAULT_POLICY instantiates and each hard-invariant violation is rejected.
# Usage: bot-policy-valid.sh
set -euo pipefail

uv --directory packages/rag-core run python - <<'PY'
import sys
from copy import deepcopy
from pydantic import ValidationError
from rag_core.policy.defaults import DEFAULT_POLICY
from rag_core.policy.schema import BotPolicy

assert DEFAULT_POLICY.name, "DEFAULT_POLICY missing name"

# Invariant 1: synthesize T=0
bad = DEFAULT_POLICY.model_dump()
bad["stages"]["synthesize"]["temperature"] = 0.1
try:
    BotPolicy.model_validate(bad)
except ValidationError:
    pass
else:
    sys.exit("expected ValidationError for synthesize.temperature != 0")

# Invariant 2: no_citations in filter.refuse_if
bad = DEFAULT_POLICY.model_dump()
bad["stages"]["filter"]["refuse_if"] = []
try:
    BotPolicy.model_validate(bad)
except ValidationError:
    pass
else:
    sys.exit("expected ValidationError for empty filter.refuse_if")

# Invariant 3: allowed_kbs non-empty
bad = DEFAULT_POLICY.model_dump()
bad["allowed_kbs"] = []
try:
    BotPolicy.model_validate(bad)
except ValidationError:
    pass
else:
    sys.exit("expected ValidationError for empty allowed_kbs")

# Invariant 4: embedding_model_id required
bad = DEFAULT_POLICY.model_dump()
bad["embedding_model_id"] = ""
try:
    BotPolicy.model_validate(bad)
except ValidationError:
    pass
else:
    sys.exit("expected ValidationError for empty embedding_model_id")

print("bot-policy invariants enforced")
PY
