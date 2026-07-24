@echo off
setlocal
cd /d "%~dp0"
node scripts\apply-phase5a4-1.mjs
if errorlevel 1 (
  echo.
  echo La Phase 5A.4.1 no se ha aplicado.
  pause
  exit /b 1
)
echo.
echo Ejecutando Astro check...
call npm run check
pause
