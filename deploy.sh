#!/bin/bash
# 微信中转站部署脚本
# 流程：本地构建 → git push → SSH 服务器拉取 → 安装依赖 → 构建 → PM2 重启
# 用法：./deploy.sh [commit_message]

set -e

SERVER_HOST="120.78.0.162"
SERVER_USER="root"
SERVER_PASS="b^WFu/,E@7eLpR."
SERVER_PATH="/srv/wechat-gateway"
COMMIT_MSG="${1:-deploy: $(date '+%Y-%m-%d %H:%M:%S')}"

echo "========================================"
echo "  微信中转站部署"
echo "  目标: ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}"
echo "========================================"

# 1. 本地构建
echo ""
echo "[1/5] 本地构建..."
npm run build

# 2. Git 提交 & 推送
echo ""
echo "[2/5] 提交并推送到 GitHub..."
git add -A
git commit -m "$COMMIT_MSG" || echo "  (无变更或已提交)"
git push origin main

# 3. SSH 到服务器拉取代码
echo ""
echo "[3/5] 服务器拉取代码..."
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_HOST} << 'ENDSSH'
cd /srv/wechat-gateway
git pull origin main
ENDSSH

# 4. 服务器安装依赖并构建
echo ""
echo "[4/5] 服务器安装依赖 & 构建..."
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_HOST} << 'ENDSSH'
cd /srv/wechat-gateway
npm install
npm run build
ENDSSH

# 5. PM2 重启
echo ""
echo "[5/5] PM2 重启..."
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_HOST} << 'ENDSSH'
pm2 restart wechat-gateway
pm2 logs wechat-gateway --lines 10 --nostream
ENDSSH

echo ""
echo "========================================"
echo "  部署完成!"
echo "  验证: curl https://wx.lovclaw.com/healthz"
echo "========================================"
