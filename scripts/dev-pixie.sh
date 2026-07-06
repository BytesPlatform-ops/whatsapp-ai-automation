#!/usr/bin/env bash
# Run the Pixie product locally: FastAPI backend (:8000) + Next.js Pixie Lab (:3002).
#
# These are two separate apps/runtimes (Python + Node), so there is no single
# `npm run dev`. This helper starts both and cleans them up together on Ctrl-C.
# (The repo root app — the WhatsApp/Express bot in src/ — is a SEPARATE service
#  and is NOT started here.)
#
# Usage:  ./scripts/dev-pixie.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- Backend (FastAPI) -------------------------------------------------------
cd "$ROOT/backend"
if [ -x ".venv/bin/uvicorn" ]; then
  UVICORN=".venv/bin/uvicorn"
elif [ -x ".venv/bin/python" ]; then
  UVICORN=".venv/bin/python -m uvicorn"
else
  echo "→ No backend/.venv found. Create it first:"
  echo "    cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi
echo "→ Starting backend on http://localhost:8000"
$UVICORN app:app --reload --port 8000 &
BACKEND_PID=$!

# --- Frontend (Next.js / Pixie Lab) -----------------------------------------
cd "$ROOT/landing"
echo "→ Starting Pixie Lab on http://localhost:3002"
npm run dev &
FRONTEND_PID=$!

# --- Cleanup -----------------------------------------------------------------
cleanup() { echo; echo "→ Stopping…"; kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
wait
