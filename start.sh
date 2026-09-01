#!/bin/bash
# 题库启动脚本
# Mac/Linux 用户：双击或终端运行 bash start.sh
cd "$(dirname "$0")"
echo "正在启动题库服务器..."
echo "请在浏览器打开: http://localhost:8080"
echo "按 Ctrl+C 停止服务器"
python3 -m http.server 8080
