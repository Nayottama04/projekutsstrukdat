@echo off
cd /d "%~dp0"

set "MYSQL_DIR=C:\mysql-connector-c++-8.0.32-winx64\lib64"
set "PATH=%MYSQL_DIR%;%PATH%"

if not exist "build\Release\raceparts.exe" (
    echo ERROR: raceparts.exe tidak ditemukan.
    echo Jalankan build terlebih dahulu.
    pause
    exit /b 1
)

echo Menjalankan RaceParts di http://localhost:8080
echo Pastikan MySQL Laragon aktif.
echo.

build\Release\raceparts.exe

echo.
echo Program berhenti.
pause
