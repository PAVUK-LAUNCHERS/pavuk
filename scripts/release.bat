@echo off
REM ============================================================
REM  PAVUK Release Pipeline
REM  Usage:  scripts\release.bat [patch|minor|major]
REM  Default bump type: patch
REM ============================================================
setlocal enabledelayedexpansion

set "BUMP=%~1"
if "%BUMP%"=="" set "BUMP=patch"

set "PROJECT=C:\Users\Admin\Desktop\PAVUK"
set "BACKEND=C:\Users\Admin\Desktop\PAVUK_BACKEND"
set "RELEASE_DIR=C:\Users\Admin\Desktop\PAVUK_RELEASE"
set "RARDESK=C:\Users\Admin\Desktop"
set "RAREXE=C:\Program Files\WinRAR\Rar.exe"

cd /d "%PROJECT%"

echo.
echo ========================================
echo   PAVUK Release Pipeline (%BUMP%)
echo ========================================
echo.

REM --- [1/4] Bump version in package.json ---
echo [1/4] Bumping version...
for /f "delims=" %%v in ('node "%PROJECT%\scripts\bump-version.js" %BUMP%') do set "NEWVER=%%v"
if "%NEWVER%"=="" (
    echo ERROR: failed to bump version. Aborting.
    pause
    exit /b 1
)
echo   New version: %NEWVER%

REM --- [2/4] Build release folder (uses existing build_release.bat) ---
echo.
echo [2/4] Building release folder...
call "%PROJECT%\build_release.bat"

REM --- [3/4] Pack into RAR ---
echo.
echo [3/4] Packing RAR...
set "RARNAME=pavuk-%NEWVER%.rar"
set "RARPATH=%RARDESK%\%RARNAME%"
if exist "%RARPATH%" del /f /q "%RARPATH%"
"%RAREXE%" a -r -ep1 -m5 "%RARPATH%" "%RELEASE_DIR%\*"
if not exist "%RARPATH%" (
    echo ERROR: RAR archive was not created. Check WinRAR path: %RAREXE%
    pause
    exit /b 1
)
echo   Archive: %RARPATH%

REM --- [4/4] Compute SHA256 ---
echo.
echo [4/4] Computing SHA256...
set "SHA256="
for /f "skip=1 tokens=* delims=" %%h in ('certutil -hashfile "%RARPATH%" SHA256 ^| findstr /v "hash CertUtil"') do (
    if not defined SHA256 set "SHA256=%%h"
)
set "SHA256=%SHA256: =%"
echo   SHA256: %SHA256%

REM Done — no backend copy needed.
REM /api/version on the backend fetches straight from GitHub Releases,
REM so the RAR only needs to be uploaded to the GitHub Release itself (see below).

echo.
echo ========================================
echo   Release %NEWVER% ready!
echo ========================================
echo Archive:    %RARPATH%
echo SHA256:     %SHA256%
echo.
echo Next manual steps:
echo   1. Create GitHub Release with tag v%NEWVER%, attach %RARNAME%.
echo      The site's /api/version and download button will pick it up automatically
echo      (5-minute cache on the backend, no redeploy or file copy needed).
echo   2. git add/commit/push package.json (new version) in the PAVUK repo.
echo   3. Test the download button and update notification from an older-version build.
echo ========================================
pause
