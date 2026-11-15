$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
$blogUrl = 'http://127.0.0.1:4000/'
$adminProcess = $null

# 关闭控制台「快速编辑」：只要在这个窗口里选中过文字，系统的任何 stdout 写入都会被
# 挂起，Node 的日志会同步阻塞，管理 API 随即整体失去响应（表现为页面一直转圈）。
function Disable-QuickEdit {
    try {
        if (-not ('SujingConsoleMode' -as [type])) {
            Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SujingConsoleMode {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr GetStdHandle(int nStdHandle);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);
}
'@ -ErrorAction Stop
        }
        $handle = [SujingConsoleMode]::GetStdHandle(-10)
        if ($handle -eq [IntPtr]::Zero -or $handle -eq [IntPtr](-1)) { return }
        $mode = [uint32]0
        if (-not [SujingConsoleMode]::GetConsoleMode($handle, [ref]$mode)) { return }
        $withoutQuickEdit = $mode -band (-bnot [uint32]0x0040)
        [void][SujingConsoleMode]::SetConsoleMode($handle, $withoutQuickEdit)
    } catch {
        # 拿不到控制台句柄（例如无窗口运行）时忽略，不影响启动。
    }
}

Disable-QuickEdit

# 子进程日志经 UTF-8 管道读取，统一由 PowerShell 写控制台。
# 同时异步读取两个流，不能同步 ReadToEnd，否则长时间运行的服务会阻塞启动。
function Receive-AdminOutput {
    foreach ($stream in $script:adminOutputStreams) {
        while ($null -ne $stream.Pending -and $stream.Pending.IsCompleted) {
            $line = $stream.Pending.GetAwaiter().GetResult()
            if ($null -eq $line) {
                $stream.Pending = $null
                break
            }
            Write-Host $line
            $stream.Pending = $stream.Reader.ReadLineAsync()
        }
    }
}

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
        # 已有服务时仍保留桌面控制台；否则 cmd /c 会立即退出，任务栏入口也随之消失。
        Write-Host "博客地址：$script:blogUrl"
        Write-Host '这是现有服务的状态窗口，关闭此窗口不会停止已运行的服务。'
        [void](Read-Host '按 Enter 关闭此窗口')
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
    # 固定提示直接使用与上面相同的 Write-Host 路径，避免欢迎语重叠。
    Write-Host '启动溯境本机管理：API + 博客预览'
    Write-Host '界面就在博客里（右下角「管」），不是单独控制台。'
    Write-Host ''
    # 用 .NET Process.Start 而不是 Start-Process：后者会把当前环境变量装进大小写不敏感
    # 的字典，环境里若同时存在 NO_PROXY / no_proxy 这类大小写成对的变量会直接抛
    # ArgumentException；Process.Start 未触碰环境字典时按原样继承，两种环境都兼容。
    # 也刻意不动 $psi.EnvironmentVariables：PS 5.1 下该属性可能为 $null，改用参数传递。
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $node
    $psi.Arguments = '"tools/admin/start.js" --no-banner'
    $psi.WorkingDirectory = $projectRoot
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $psi.StandardErrorEncoding = New-Object System.Text.UTF8Encoding($false)
    $adminProcess = [System.Diagnostics.Process]::Start($psi)
    $script:adminOutputStreams = @(
        @{ Reader = $adminProcess.StandardOutput; Pending = $adminProcess.StandardOutput.ReadLineAsync() }
        @{ Reader = $adminProcess.StandardError; Pending = $adminProcess.StandardError.ReadLineAsync() }
    )
    $deadline = (Get-Date).AddSeconds(120)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        Receive-AdminOutput
        if ($adminProcess.HasExited) { throw '管理程序提前退出，请查看上方错误。' }
        if (Test-ConsoleReady) { $ready = $true; break }
        Start-Sleep -Milliseconds 700
    }
    if (!$ready) { throw '启动等待超过 120 秒，请查看上方日志。' }
    Start-Process $script:blogUrl
    while (!$adminProcess.HasExited) {
        Receive-AdminOutput
        Start-Sleep -Milliseconds 100
    }
    Receive-AdminOutput
    if ($adminProcess.ExitCode -ne 0) { throw "管理程序退出，错误码：$($adminProcess.ExitCode)" }
} catch {
    Write-Host "启动失败：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    if ($adminProcess -and !$adminProcess.HasExited) {
        & taskkill.exe /PID $adminProcess.Id /T /F 2>$null | Out-Null
    }
    if ($adminProcess) { $adminProcess.Dispose() }
}
