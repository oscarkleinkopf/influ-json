#!/usr/bin/env bash
# U1 — Arranque local de un clic (Linux/macOS). Windows: start-studio.cmd
set -euo pipefail
cd "$(dirname "$0")"

MIN_NODE=18
OPEN_BROWSER="${OPEN_BROWSER:-1}"
STUDIO_URL="${STUDIO_URL:-http://127.0.0.1:3000}"

die() {
  echo ""
  echo "ERROR: $*" >&2
  echo ""
  echo "Qué hacer:" >&2
  echo "  1. Instala Node.js ${MIN_NODE}+ desde https://nodejs.org (LTS)" >&2
  echo "  2. Vuelve a ejecutar: ./start-studio.sh" >&2
  echo "  3. Si ya tienes Node, cierra y abre la terminal." >&2
  exit 1
}

if ! command -v node >/dev/null 2>&1; then
  die "Node.js no está instalado (hace falta v${MIN_NODE}+)."
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "${NODE_MAJOR}" -lt "${MIN_NODE}" ]; then
  die "Node.js v${NODE_MAJOR} es demasiado antiguo. Necesitas v${MIN_NODE}+ (tienes: $(node -v))."
fi

if [ ! -f package.json ]; then
  die "No encuentro package.json. Ejecuta este script desde la carpeta del Studio (ZIP descomprimido)."
fi

if [ ! -d node_modules ]; then
  echo "Primera vez: instalando dependencias (npm install)…"
  npm install || die "npm install falló. Revisa la conexión a internet y vuelve a intentar."
fi

echo "Comprobación rápida (doctor)…"
npm run doctor || true

open_studio() {
  case "$(uname -s 2>/dev/null || echo unknown)" in
    Darwin) command -v open >/dev/null 2>&1 && open "$STUDIO_URL" ;;
    Linux) command -v xdg-open >/dev/null 2>&1 && xdg-open "$STUDIO_URL" >/dev/null 2>&1 || true ;;
    *) ;;
  esac
}

if [ "$OPEN_BROWSER" != "0" ] && [ "${CI:-}" != "true" ]; then
  (
    for _ in $(seq 1 40); do
      if command -v curl >/dev/null 2>&1; then
        curl -sf "$STUDIO_URL/api/status" >/dev/null 2>&1 && break
      elif command -v wget >/dev/null 2>&1; then
        wget -q -O /dev/null "$STUDIO_URL/api/status" 2>/dev/null && break
      else
        sleep 2
        break
      fi
      sleep 0.4
    done
    open_studio || true
  ) &
fi

echo "Arrancando Studio en ${STUDIO_URL} …"
echo "(PIN por defecto: 1234 — cámbialo en el asistente o en .env)"
exec npm start
