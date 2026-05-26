@echo off
setlocal
cd /d "%~dp0.."
echo Cleaning wrong archivo-motorsport preview routes...
if exist "src\pages\archivo-motorsport\_dossier-preview.astro" del "src\pages\archivo-motorsport\_dossier-preview.astro"
if exist "src\pages\archivo-motorsport\dossier-preview.astro" del "src\pages\archivo-motorsport\dossier-preview.astro"
rd "src\pages\archivo-motorsport" 2>nul
echo Done.
