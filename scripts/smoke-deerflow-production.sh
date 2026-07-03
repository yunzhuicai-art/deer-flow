#!/usr/bin/env bash
set -euo pipefail

FRONTEND_URL="${FRONTEND_URL:-https://deerflow-official-frontend.vercel.app}"
GATEWAY_URL="${GATEWAY_URL:-https://deerflow.62-238-14-244.sslip.io}"

echo "== DeerFlow production smoke test =="
echo "frontend: ${FRONTEND_URL}"
echo "gateway:  ${GATEWAY_URL}"
echo

echo "== frontend home =="
curl -fsSIL "${FRONTEND_URL}/" | sed -n '1,12p'
echo

echo "== frontend branding check =="
home_html="$(mktemp)"
curl -fsSL "${FRONTEND_URL}/" -o "${home_html}"
if grep -qi "DeerFlow" "${home_html}"; then
  echo "FAIL: frontend home still contains visible DeerFlow text"
  exit 1
fi
if ! grep -qiE "Agent Workspace|Open Workspace" "${home_html}"; then
  echo "FAIL: expected Agent Workspace branding was not found"
  exit 1
fi
echo "OK: frontend branding"
echo

echo "== gateway health =="
curl -fsS "${GATEWAY_URL}/health"
echo
echo

echo "== frontend -> gateway proxy auth setup-status =="
setup_body="$(mktemp)"
setup_status="$(curl -sS -o "${setup_body}" -w "%{http_code}" "${FRONTEND_URL}/api/v1/auth/setup-status" || true)"
echo "status: ${setup_status}"
sed -n '1,20p' "${setup_body}"
if [ "${setup_status}" != "200" ]; then
  echo "FAIL: setup-status proxy check failed"
  exit 1
fi
echo

echo "== frontend -> gateway proxy models =="
models_body="$(mktemp)"
models_status="$(curl -sS -o "${models_body}" -w "%{http_code}" "${FRONTEND_URL}/api/models" || true)"
echo "status: ${models_status}"
sed -n '1,20p' "${models_body}"
echo

echo "Smoke test complete."
echo "Note: login/session and sandbox execution still require an authenticated browser or a test user cookie."
