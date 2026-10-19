@echo off
cd /d "%~dp0"
python -m venv .venv
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
if errorlevel 1 goto failed
echo Installation complete. Run start.cmd next.
pause
exit /b 0
:failed
echo Installation failed. See the error above.
pause
exit /b 1
