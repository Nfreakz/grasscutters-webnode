@echo off
REM Limpieza segura del preview creado en una ruta equivocada.
REM Ejecutar desde la raíz del proyecto: G:\Web Node\grasscutters-webnode

powershell -ExecutionPolicy Bypass -File scripts\cleanup-wrong-archivo-motorsport-preview.ps1
