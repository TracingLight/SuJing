@echo off
setlocal
cd /d "%~dp0"

echo Publishing the newest blog post to origin/main...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\publish-latest.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo Done.
) else (
  echo Publish failed. Review the message above.
)
pause
exit /b %EXIT_CODE%
