$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop '溯境控制台.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $env:ComSpec
$shortcut.Arguments = '/d /c ""' + (Join-Path $projectRoot 'start-console.bat') + '""'
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = (Join-Path $PSScriptRoot 'console-icon.ico') + ',0'
$shortcut.Description = '启动溯境本机管理与博客预览'
$shortcut.WindowStyle = 1
$shortcut.Save()
Write-Host "已创建桌面入口：$shortcutPath"
