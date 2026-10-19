@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
 echo Run install.cmd first.
 pause
 exit /b 1
)
echo Open http://127.0.0.1:8765/ after the server starts.
".venv\Scripts\python.exe" backend\server.py %*
pause
