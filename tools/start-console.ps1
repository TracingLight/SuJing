$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
$blogUrl = 'http://127.0.0.1:4000/'
$adminProcess = $null

function Test-ConsoleReady {
    try {
        $config = Get-Content -LiteralPath (Join-Path $projectRoot '.sujing-admin.json') -Raw | ConvertFrom-Json
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$($config.port)/api/health" -TimeoutSec 2
        if ($health.blogHint -match '^https?://') { $script:blogUrl = [string]$health.blogHint }
        $page = Invoke-WebRequest -Uri $script:blogUrl -UseBasicParsing -TimeoutSec 2
        return ($health.ok -eq $true -and $health.mode -eq 'blog-inline' -and $health.root -eq $projectRoot -and $page.StatusCode -eq 200)
    } catch { return $false }
}

try {
    if (Test-ConsoleReady) {
        Write-Host '管理服务已运行，正在打开博客控制台。'
        Start-Process $script:blogUrl
        exit 0
    }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'tools/admin/start.js'))) {
        throw '找不到本机管理程序 tools/admin/start.js。'
    }
    if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules/hexo'))) {
        throw '请先在项目目录运行 npm install 安装依赖。'
    }
    Write-Host '正在启动溯境控制台，页面就绪后会自动打开。'
    Write-Host '请保留此窗口；按 Ctrl+C 停止服务。首次使用时，将下方 Token 粘贴到网页右下角「管」中。'
    $adminProcess = Start-Process -FilePath $node -ArgumentList '"tools/admin/start.js"' -WorkingDirectory $projectRoot -NoNewWindow -PassThru
    $deadline = (Get-Date).AddSeconds(120)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        if ($adminProcess.HasExited) { throw '管理程序提前退出，请查看上方错误。' }
        if (Test-ConsoleReady) { $ready = $true; break }
        Start-Sleep -Milliseconds 700
    }
    if (!$ready) { throw '启动等待超过 120 秒，请查看上方日志。' }
    Start-Process $script:blogUrl
    while (!$adminProcess.HasExited) { Start-Sleep -Seconds 1 }
    if ($adminProcess.ExitCode -ne 0) { throw "管理程序退出，错误码：$($adminProcess.ExitCode)" }
} catch {
    Write-Host "启动失败：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    if ($adminProcess -and !$adminProcess.HasExited) {
        & taskkill.exe /PID $adminProcess.Id /T /F 2>$null | Out-Null
    }
}
