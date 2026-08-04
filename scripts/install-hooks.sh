#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Studio Clarté — Git security hooks installer
#
# Installs into .git/hooks/ :
#   pre-commit : `gitleaks protect --staged`  (blocks a commit containing a secret)
#   pre-push   : scans the pushed commit range (blocks a push with a secret)
#
# Runs automatically via the npm `prepare` script (npm install).
# If gitleaks is not installed, the hooks degrade gracefully
# (commits are not blocked) and a warning is printed.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS_DIR="${ROOT_DIR}/.git/hooks"

if [ ! -d "${HOOKS_DIR}" ]; then
  # Not a git repository (e.g. CI without .git) → nothing to install
  exit 0
fi

# ── Hook contents ──────────────────────────────────────────────────
PRE_COMMIT='#!/usr/bin/env bash
# Gitleaks pre-commit (installed by scripts/install-hooks.sh)
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "⚠️  gitleaks is not installed — run: brew install gitleaks" >&2
  exit 0
fi
gitleaks protect --staged --no-banner || exit 1
'

PRE_PUSH='#!/usr/bin/env bash
# Gitleaks pre-push (installed by scripts/install-hooks.sh)
# Note: the `--pre-push` flag was removed in gitleaks ≥ 8.20 — we scan the
# pushed commit range via `git log --log-opts` (the hook receives
# "<local ref> <local sha> <remote ref> <remote sha>" on stdin).
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "⚠️  gitleaks is not installed — run: brew install gitleaks" >&2
  exit 0
fi

while read -r local_ref local_sha remote_ref remote_sha; do
  [ -z "$local_sha" ] && continue
  # Branch deletion (null sha) → nothing to scan
  [ "$local_sha" = "0000000000000000000000000000000000000000" ] && continue
  if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
    range="--all"      # new branch: scan the full history
  else
    range="${remote_sha}..${local_sha}"
  fi
  if ! gitleaks git --log-opts="$range" --no-banner; then
    echo "⛔ Secrets detected in the pushed commits — push blocked" >&2
    exit 1
  fi
done
'

install_hook() {
  local name="$1"
  local content="$2"
  if [ -f "${HOOKS_DIR}/${name}" ]; then
    # Do not overwrite a custom hook (unless it carries our marker)
    if grep -q "install-hooks.sh" "${HOOKS_DIR}/${name}" 2>/dev/null; then
      printf '%s' "${content}" > "${HOOKS_DIR}/${name}"
      chmod +x "${HOOKS_DIR}/${name}"
      echo "✓ hook ${name} updated"
    else
      echo "⚠️  existing hook ${name} preserved (delete it to force installation)" >&2
    fi
  else
    printf '%s' "${content}" > "${HOOKS_DIR}/${name}"
    chmod +x "${HOOKS_DIR}/${name}"
    echo "✓ hook ${name} installed"
  fi
}

install_hook "pre-commit" "${PRE_COMMIT}"
install_hook "pre-push" "${PRE_PUSH}"

if command -v gitleaks >/dev/null 2>&1; then
  echo "✓ gitleaks $(gitleaks version) — protection active"
else
  echo "⚠️  gitleaks is not installed (brew install gitleaks) — hooks pending" >&2
fi
