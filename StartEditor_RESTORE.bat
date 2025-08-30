
@echo off
setlocal
cd /d "%~dp0editor"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
call npm start
