@echo off
set PORT=%1
if "%PORT%"=="" set PORT=8080
echo Serving http://localhost:%PORT% (press Ctrl+C to stop)
python -m http.server %PORT%
