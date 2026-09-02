@echo off
setlocal
cd /d "%~dp0client"
start "" "node_modules\electron\dist\electron.exe" .
exit
