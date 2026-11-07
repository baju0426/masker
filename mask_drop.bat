@echo off
chcp 65001 >nul
if "%~1"=="" (
  echo Drag files or a folder onto this file.
  pause
  exit /b
)
node "%~dp0masker.js" %*
pause
