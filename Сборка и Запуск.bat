@echo off
title Ethernet Telegram - Сборка и Запуск
cd /d "%~dp0client"
echo Сборка клиента...
call npm run app:build
if %errorlevel% neq 0 (
    echo [ОШИБКА] Сборка не удалась.
    pause
    exit /b %errorlevel%
)
echo Запуск приложения...
start "" "node_modules\electron\dist\electron.exe" .
exit
