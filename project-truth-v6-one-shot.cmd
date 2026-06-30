@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\project-truth.ps1" v6-one-shot %*
exit /b %ERRORLEVEL%
