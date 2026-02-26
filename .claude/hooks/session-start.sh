#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "Session start hook running..."

# No dependencies yet — add install commands here as the project grows.
# Examples:
#   npm install          (Node.js)
#   pip install -e .     (Python)
#   bundle install       (Ruby)
#   cargo build          (Rust)

echo "Session start hook complete."
