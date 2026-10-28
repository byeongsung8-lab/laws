@echo off
chcp 65001 > nul
title 해양경찰 법령정보센터 서버 종료

echo ========================================================
echo    해양경찰 법령정보센터 서버를 안전하게 종료합니다.
echo ========================================================

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
    taskkill /f /pid %%a > nul 2>&1
)

echo.
echo 서버가 성공적으로 종료되었습니다.
pause

