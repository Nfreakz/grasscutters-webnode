@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0cleanup-archivo-final-trash.ps1" %*
endlocal
