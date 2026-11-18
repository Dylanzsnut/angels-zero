@echo off
setlocal
cd /d "%~dp0"

echo Starting ANGELS ZERO...

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 server.py
    goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
    python server.py
    goto :end
)

where python3 >nul 2>nul
if %errorlevel%==0 (
    python3 server.py
    goto :end
)

where npx >nul 2>nul
if %errorlevel%==0 (
    echo Python not found. Launching with Node.js static server...
    start "" "http://127.0.0.1:8090/"
    npx --yes serve -l 8090 angel-zero
    goto :end
)

echo.
echo [ERROR] Python 3 or Node.js is required to run ANGELS ZERO locally.
echo Install Python from https://www.python.org/downloads/ or Node.js from https://nodejs.org/
echo.
pause

:end
endlocal
