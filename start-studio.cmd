@echo off
REM Arranque local del Studio (Corte C) — Linux/macOS: start-studio.sh
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js no esta instalado. Instala Node 18+ desde https://nodejs.org
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias ^(npm install^)...
  call npm install
  if errorlevel 1 exit /b 1
)

echo Comprobacion rapida ^(doctor^)...
call npm run doctor

echo Arrancando Studio en http://127.0.0.1:3000 ...
call npm start
