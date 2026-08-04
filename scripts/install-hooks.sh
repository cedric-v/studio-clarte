#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Studio Clarté — installation des hooks Git de sécurité
#
# Installe dans .git/hooks/ :
#   pre-commit : `gitleaks protect --staged`  (bloque un commit avec secret)
#   pre-push   : `gitleaks git --pre-push`    (bloque un push avec secret)
#
# Exécuté automatiquement via le script npm `prepare` (npm install).
# Si gitleaks n'est pas installé, les hooks désactivent proprement
# (le commit n'est pas bloqué) et un avertissement s'affiche.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS_DIR="${ROOT_DIR}/.git/hooks"

if [ ! -d "${HOOKS_DIR}" ]; then
  # Pas de dépôt git (ex: CI sans .git) → rien à installer
  exit 0
fi

# ── Contenu des hooks ──────────────────────────────────────────────
PRE_COMMIT='#!/usr/bin/env bash
# Gitleaks pre-commit (installé par scripts/install-hooks.sh)
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "⚠️  gitleaks non installé — exécutez : brew install gitleaks" >&2
  exit 0
fi
gitleaks protect --staged --no-banner --exit-code 1 || exit 1
'

PRE_PUSH='#!/usr/bin/env bash
# Gitleaks pre-push (installé par scripts/install-hooks.sh)
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "⚠️  gitleaks non installé — exécutez : brew install gitleaks" >&2
  exit 0
fi
gitleaks git --pre-push --no-banner --exit-code 1 || exit 1
'

install_hook() {
  local name="$1"
  local content="$2"
  if [ -f "${HOOKS_DIR}/${name}" ]; then
    # Ne pas écraser un hook personnalisé existant (sauf notre marqueur)
    if grep -q "install-hooks.sh" "${HOOKS_DIR}/${name}" 2>/dev/null; then
      printf '%s' "${content}" > "${HOOKS_DIR}/${name}"
      chmod +x "${HOOKS_DIR}/${name}"
      echo "✓ hook ${name} mis à jour"
    else
      echo "⚠️  hook ${name} existant préservé (supprimez-le pour forcer l'installation)" >&2
    fi
  else
    printf '%s' "${content}" > "${HOOKS_DIR}/${name}"
    chmod +x "${HOOKS_DIR}/${name}"
    echo "✓ hook ${name} installé"
  fi
}

install_hook "pre-commit" "${PRE_COMMIT}"
install_hook "pre-push" "${PRE_PUSH}"

if command -v gitleaks >/dev/null 2>&1; then
  echo "✓ gitleaks $(gitleaks version) — protection active"
else
  echo "⚠️  gitleaks n'est pas installé (brew install gitleaks) — hooks en attente" >&2
fi
