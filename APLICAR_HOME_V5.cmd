@echo off
setlocal
set "GC_PROJECT_ROOT=G:\Web Node\grasscutters-webnode"
cd /d "%~dp0"

node scripts\apply-home-v5-popover-rows-stability.mjs
if errorlevel 1 (
  echo.
  echo No se pudo aplicar Home V5.
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
echo Home V5 aplicada y build validado.
pause
