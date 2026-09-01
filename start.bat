@echo off
REM 题库启动脚本 (Windows)
cd /d "%~dp0"
echo 正在启动题库服务器...
echo 请在浏览器打开: http://localhost:8080
echo 按 Ctrl+C 停止服务器
python -m http.server 8080
pause
