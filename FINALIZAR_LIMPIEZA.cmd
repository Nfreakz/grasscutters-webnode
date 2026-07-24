@echo off
setlocal
set "ROOT=G:\Web Node\grasscutters-webnode"

cd /d "%ROOT%" || (
  echo ERROR: No se pudo abrir %ROOT%
  pause
  exit /b 1
)

echo Eliminando tooling temporal final...
del /f /q "EJECUTAR_PHASE6_4.cmd" 2>nul
del /f /q "scripts\phase6-4-final-git-hygiene.mjs" 2>nul

echo.
echo Estado Git final:
git status --short

echo.
echo Limpieza final completada.
echo Solo deberian quedar las 7 eliminaciones historicas intencionadas.
pause
