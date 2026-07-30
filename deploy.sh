#!/usr/bin/env bash
set -euo pipefail

# foxmortgage.ca deploy script
# Vercel project: foxmortgage-ca
# Production domain: foxmortgage.ca / www.foxmortgage.ca

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
error() { echo -e "${RED}[error]${NC} $*"; exit 1; }

cd "$(dirname "$0")"

# ── Pre-flight checks ──────────────────────────────────────────────
command -v vercel >/dev/null 2>&1 || error "vercel CLI not found. Install: npm i -g vercel"
command -v git    >/dev/null 2>&1 || error "git not found"

# Ensure we're on main
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  error "Must be on 'main' branch to deploy production (currently on '$BRANCH')"
fi

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
  warn "Uncommitted changes detected:"
  git status --short
  echo ""
  read -rp "Continue anyway? (y/N) " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
fi

# ── Build check ─────────────────────────────────────────────────────
info "Running local build check..."
npm run build || error "Build failed — fix errors before deploying"

# ── Lint ────────────────────────────────────────────────────────────
info "Running lint..."
npm run lint || warn "Lint warnings detected (non-blocking)"

# ── Deploy ──────────────────────────────────────────────────────────
MODE="${1:-preview}"

if [[ "$MODE" == "production" || "$MODE" == "prod" ]]; then
  info "Deploying to PRODUCTION (foxmortgage.ca)..."
  echo ""
  read -rp "Confirm production deploy? (y/N) " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { info "Aborted."; exit 0; }

  # Push to main first (triggers Vercel auto-deploy)
  info "Pushing to origin/main..."
  git push origin main

  # Also trigger explicit Vercel production deploy for immediate feedback
  info "Triggering Vercel production deploy..."
  vercel --prod

  echo ""
  info "Production deploy triggered."
  info "  Site: https://foxmortgage.ca"
  info "  Dashboard: https://vercel.com/foxmortgage2020/foxmortgage-ca"
else
  info "Deploying PREVIEW..."
  URL=$(vercel)
  echo ""
  info "Preview deployed: $URL"
fi

# ── Post-deploy ─────────────────────────────────────────────────────
COMMIT=$(git rev-parse --short HEAD)
info "Deployed commit: $COMMIT ($(git log -1 --format='%s'))"
