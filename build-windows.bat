@echo off
rem Build RaceParts di Windows (jalankan dari "x64 Native Tools Command Prompt for VS" atau "Developer Command Prompt").
rem Ubah baris di bawah bila MySQL Connector/C++ terpasang di folder lain.
setlocal
cd /d "%~dp0"
if "%MYSQLCPPCONN_ROOT%"=="" set "MYSQLCPPCONN_ROOT=C:\Program Files\MySQL\MySQL Connector C++ 8.0"
echo MySQL Connector/C++: %MYSQLCPPCONN_ROOT%
cmake -S . -B build -DMYSQLCPPCONN_ROOT="%MYSQLCPPCONN_ROOT%"
if errorlevel 1 goto fail
cmake --build build --config Release
if errorlevel 1 goto fail
copy /y "%MYSQLCPPCONN_ROOT%\lib64\*.dll" "build\Release\" >nul 2>&1
echo.
echo Build selesai. Jalankan run-windows.bat
exit /b 0
:fail
echo.
echo Build gagal. Lihat README.md bagian Troubleshooting.
exit /b 1
