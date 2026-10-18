@echo off
chcp 65001 >nul
title SuJing Console
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start-console.ps1"
if errorlevel 1 pause
