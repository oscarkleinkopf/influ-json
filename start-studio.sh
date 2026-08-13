#!/usr/bin/env bash
# Arranque local del Studio (Corte C) — Windows: start-studio.cmd
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js no está instalado. Instala Node 18+ desde https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Instalando dependencias (npm install)…"
  npm install
fi

echo "Comprobación rápida (doctor)…"
npm run doctor || true

echo "Arrancando Studio en http://127.0.0.1:3000 …"
exec npm start
