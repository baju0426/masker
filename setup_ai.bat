@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [1/2] AI parts install (npm, about 500MB, once)
call npm install --ignore-scripts --no-save @huggingface/transformers
if errorlevel 1 (
  echo npm install failed. Check internet or proxy.
  pause
  exit /b 1
)
echo [2/2] AI model download (about 15MB, once)
if exist "%~dp0get_model.js" (node "%~dp0get_model.js") else (node "%~dp0get_model.js.txt")
pause
