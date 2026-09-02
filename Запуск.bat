@echo off
setlocal
cd /d "%~dp0client"
if not exist "node_modules\electron\dist\electron.exe" (
    echo [ОШИБКА] electron.exe не найден в папке node_modules.
    pause
    exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" .
exit
