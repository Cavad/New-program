@echo off
rem Builds dist\TimesheetStudio.html and dist\TimesheetStudio.exe on Windows.
rem Needs Node.js 18+ (https://nodejs.org) and Go 1.22+ (https://go.dev/dl).
cd /d "%~dp0"
pushd web
if not exist node_modules call npm ci || goto :err
popd
node web\build.mjs || goto :err
pushd launcher
set CGO_ENABLED=0
go build -trimpath -ldflags "-s -w -H=windowsgui" -o ..\dist\TimesheetStudio.exe . || goto :err
popd
echo Done: dist\TimesheetStudio.exe and dist\TimesheetStudio.html
exit /b 0
:err
echo Build failed.
exit /b 1
