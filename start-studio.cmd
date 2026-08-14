@echo off
REM U1 — Arranque local de un clic (Windows). Linux/macOS: start-studio.sh
setlocal EnableExtensions
cd /d "%~dp0"

set "MIN_NODE=18"
if "%OPEN_BROWSER%"=="" set "OPEN_BROWSER=1"
if "%STUDIO_URL%"=="" set "STUDIO_URL=http://127.0.0.1:3000"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: Node.js no esta instalado ^(hace falta v%MIN_NODE%+^).
  echo.
  echo Que hacer:
  echo   1. Instala Node.js LTS desde https://nodejs.org
  echo   2. Cierra y vuelve a abrir esta ventana
  echo   3. Doble clic de nuevo en start-studio.cmd
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=v." %%A in ('node -v') do set "NODE_MAJOR=%%A"
REM node -v is like v18.19.0 — strip handled above may leave empty; use node -p
for /f %%A in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%A"
if not defined NODE_MAJOR set "NODE_MAJOR=0"
if %NODE_MAJOR% LSS %MIN_NODE% (
  echo.
  echo ERROR: Node.js v%NODE_MAJOR% es demasiado antiguo. Necesitas v%MIN_NODE%+.
  echo Tienes: 
  node -v
  echo.
  echo Que hacer: instala Node LTS desde https://nodejs.org y reintenta.
  echo.
  pause
  exit /b 1
)

if not exist package.json (
  echo ERROR: No encuentro package.json. Descomprime el ZIP completo y ejecuta desde esa carpeta.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Primera vez: instalando dependencias ^(npm install^)...
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install fallo. Revisa internet y vuelve a intentar.
    pause
    exit /b 1
  )
)

echo Comprobacion rapida ^(doctor^)...
call npm run doctor

if /I not "%OPEN_BROWSER%"=="0" if /I not "%CI%"=="true" (
  start "" cmd /c "ping -n 4 127.0.0.1 >nul & start \"\" \"%STUDIO_URL%\""
)

echo Arrancando Studio en %STUDIO_URL% ...
echo ^(PIN por defecto: 1234 — cambialo en el asistente o en .env^)
call npm start
set "EC=%ERRORLEVEL%"
if not "%EC%"=="0" (
  echo.
  echo El Studio se detuvo con codigo %EC%.
  pause
)
exit /b %EC%
