@echo off
setlocal
set "GC_PROJECT_ROOT=G:\Web Node\grasscutters-webnode"
cd /d "%~dp0"

node scripts\apply-home-top-times-fixed-v6.mjs
if errorlevel 1 (
  echo.
  echo No se pudo aplicar Home Top Times V6.
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
echo Home Top Times V6 aplicada y build validado.
pause
