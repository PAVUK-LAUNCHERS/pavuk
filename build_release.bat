@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set "SOURCE=C:\Users\Admin\Desktop\PAVUK"
set "DEST=C:\Users\Admin\Desktop\PAVUK_RELEASE"
set "EDIST=%SOURCE%\node_modules\electron\dist"
set "DDIST=%DEST%\node_modules\electron\dist"

echo.
echo ========================================
echo   PAVUK Release Builder
echo ========================================
echo.

if exist "%DEST%" (
    echo [0/5] Removing old release folder...
    rmdir /s /q "%DEST%"
)

echo [1/5] Copying source folders (auto-picks up new files)...
xcopy "%SOURCE%\src"       "%DEST%\src\"       /e /i /q >nul
xcopy "%SOURCE%\assets"    "%DEST%\assets\"    /e /i /q >nul
xcopy "%SOURCE%\launchers" "%DEST%\launchers\" /e /i /q >nul

echo [2/5] Copying root files...
copy "%SOURCE%\main.js"             "%DEST%\main.js"             >nul
copy "%SOURCE%\preload.js"          "%DEST%\preload.js"          >nul
copy "%SOURCE%\package.json"        "%DEST%\package.json"        >nul
copy "%SOURCE%\reset-shortcuts.bat" "%DEST%\reset-shortcuts.bat" >nul

echo [3/5] Copying Electron runtime...
mkdir "%DDIST%\locales"    >nul 2>&1
mkdir "%DDIST%\resources"  >nul 2>&1
copy "%EDIST%\electron.exe"            "%DDIST%\electron.exe"            >nul
copy "%EDIST%\ffmpeg.dll"              "%DDIST%\ffmpeg.dll"              >nul
copy "%EDIST%\libEGL.dll"              "%DDIST%\libEGL.dll"              >nul
copy "%EDIST%\libGLESv2.dll"           "%DDIST%\libGLESv2.dll"           >nul
copy "%EDIST%\d3dcompiler_47.dll"      "%DDIST%\d3dcompiler_47.dll"      >nul
copy "%EDIST%\vk_swiftshader.dll"      "%DDIST%\vk_swiftshader.dll"      >nul
copy "%EDIST%\vk_swiftshader_icd.json" "%DDIST%\vk_swiftshader_icd.json" >nul
copy "%EDIST%\vulkan-1.dll"            "%DDIST%\vulkan-1.dll"            >nul
copy "%EDIST%\chrome_100_percent.pak"  "%DDIST%\chrome_100_percent.pak"  >nul
copy "%EDIST%\chrome_200_percent.pak"  "%DDIST%\chrome_200_percent.pak"  >nul
copy "%EDIST%\resources.pak"           "%DDIST%\resources.pak"           >nul
copy "%EDIST%\icudtl.dat"              "%DDIST%\icudtl.dat"              >nul
copy "%EDIST%\snapshot_blob.bin"       "%DDIST%\snapshot_blob.bin"       >nul
copy "%EDIST%\v8_context_snapshot.bin" "%DDIST%\v8_context_snapshot.bin" >nul
copy "%EDIST%\resources\default_app.asar" "%DDIST%\resources\default_app.asar" >nul

echo [4/5] Copying locales (ru, en-US, uk)...
copy "%EDIST%\locales\ru.pak"    "%DDIST%\locales\ru.pak"    >nul
copy "%EDIST%\locales\en-US.pak" "%DDIST%\locales\en-US.pak" >nul
copy "%EDIST%\locales\uk.pak"    "%DDIST%\locales\uk.pak"    >nul

echo [5/5] Done!
echo.
echo ========================================
echo   Folder ready: %DEST%
echo ========================================
echo.
echo Next steps:
echo   1. Test launchers from PAVUK_RELEASE
echo   2. Pack PAVUK_RELEASE folder into RAR
echo.
pause
