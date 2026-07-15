@echo off
echo Поиск и сброс флагов ярлыков PAVUK / SCOROBEY...
echo.

set FOUND=0

for /d %%D in ("%APPDATA%\*") do (
    if exist "%%D\pavuk-shortcut-created.flag" (
        del "%%D\pavuk-shortcut-created.flag"
        echo [OK] Удалён флаг PAVUK из: %%D
        set FOUND=1
    )
    if exist "%%D\scorobey-shortcut-created.flag" (
        del "%%D\scorobey-shortcut-created.flag"
        echo [OK] Удалён флаг SCOROBEY из: %%D
        set FOUND=1
    )
)

if "%FOUND%"=="0" (
    echo Флаги не найдены — возможно лаунчеры ещё не запускались.
)

echo.
echo Готово. Запусти лаунчеры из папки launchers\ — ярлыки создадутся заново.
pause
