@echo off
setlocal
set "GC_PROJECT_ROOT=G:\Web Node\grasscutters-webnode"
cd /d "%~dp0"

node scripts\apply-home-pilot-links-v5-1.mjs
if errorlevel 1 (
  echo.
  echo No se pudo aplicar Pilot Links V5.1.
  pause
  exit /b 1
)

cd /d "%GC_PROJECT_ROOT%"
call npm run check
if errorlevel 1 (
  echo.
  echo Astro check ha fallado.
  pause
  exit /b 1
)

call npm run build
if errorlevel 1 (
  echo.
  echo Build ha fallado.
  pause
  exit /b 1
)

echo.
echo Pilot Links V5.1 aplicado y build validado.
pause
