@echo off
setlocal
cd /d "%~dp0.."
node scripts\import-archivo-csv.mjs _imports\archivo\archivo_motorsport_v3.csv src\data\archive\items.json
endlocal
