# 微信中转站部署脚本 (Windows PowerShell)
# 流程：本地构建 → git push → SSH 服务器拉取 → 安装依赖 → 构建 → PM2 重启
# 用法：.\deploy.ps1 [-Message "提交信息"]

param(
    [string]$Message = "deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

$ServerHost = "120.78.0.162"
$ServerUser = "root"
$ServerPass = 'b^WFu/,E@7eLpR.'
$ServerPath = "/srv/wechat-gateway"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  微信中转站部署" -ForegroundColor Cyan
Write-Host "  目标: ${ServerUser}@${ServerHost}:${ServerPath}" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. 本地构建
Write-Host "`n[1/5] 本地构建..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "构建失败!" -ForegroundColor Red
    exit 1
}

# 2. Git 提交 & 推送
Write-Host "`n[2/5] 提交并推送到 GitHub..." -ForegroundColor Yellow
git add -A
git commit -m $Message 2>$null
if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 1) {
    git push origin main
} else {
    Write-Host "Git 操作异常，跳过..." -ForegroundColor Yellow
}

# 3. SSH 到服务器拉取代码
Write-Host "`n[3/5] 服务器拉取代码..." -ForegroundColor Yellow
$pullCmd = @"
cd ${ServerPath} && git pull origin main
"@
sshpass -p $ServerPass ssh -o StrictHostKeyChecking=no ${ServerUser}@${ServerHost} $pullCmd

# 4. 服务器安装依赖并构建
Write-Host "`n[4/5] 服务器安装依赖 & 构建..." -ForegroundColor Yellow
$buildCmd = @"
cd ${ServerPath} && npm install && npm run build
"@
sshpass -p $ServerPass ssh -o StrictHostKeyChecking=no ${ServerUser}@${ServerHost} $buildCmd

# 5. PM2 重启
Write-Host "`n[5/5] PM2 重启..." -ForegroundColor Yellow
$pm2Cmd = @"
pm2 restart wechat-gateway && pm2 logs wechat-gateway --lines 10 --nostream
"@
sshpass -p $ServerPass ssh -o StrictHostKeyChecking=no ${ServerUser}@${ServerHost} $pm2Cmd

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  部署完成!" -ForegroundColor Green
Write-Host "  验证: curl https://wx.lovclaw.com/healthz" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
