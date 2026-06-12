#!/bin/bash
# PolarClock 部署脚本

set -e

echo "🚀 启动 PolarClock..."

# 检查端口
check_port() {
    if lsof -i :$1 > /dev/null 2>&1; then
        echo "⚠️  端口 $1 已被占用"
        return 1
    fi
    return 0
}

echo "📦 检查后端端口 15550..."
check_port 15550

echo "📦 检查前端端口 4555..."
check_port 4555

# 启动后端
echo "🔧 启动后端服务..."
cd "$(dirname "$0")/../backend"
nohup python main.py > backend.log 2>&1 &
BACKEND_PID=$!
echo "✅ 后端已启动 (PID: $BACKEND_PID)"

# 等待后端启动
sleep 2

# 启动前端
echo "🔧 启动前端服务..."
cd "$(dirname "$0")/../frontend"
nohup npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!
echo "✅ 前端已启动 (PID: $FRONTEND_PID)"

echo ""
echo "🎉 PolarClock 已启动!"
echo "   后端: http://localhost:15550"
echo "   前端: http://localhost:4555/clock/login"
echo ""
echo "📝 日志位置:"
echo "   后端: $(dirname "$0")/../backend/backend.log"
echo "   前端: $(dirname "$0")/../frontend/frontend.log"
echo ""
echo "🛑 停止服务:"
echo "   kill $BACKEND_PID $FRONTEND_PID"
