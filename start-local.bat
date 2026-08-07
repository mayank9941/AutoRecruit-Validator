@echo off
rem Starts the AutoRecruit app locally in two separate terminal windows.
rem Requires: local Postgres running, backend\.env configured, deps installed.
start "AutoRecruit Backend (close window to stop)" cmd /k "cd /d %~dp0backend && venv\Scripts\python.exe -m uvicorn app.main:app --port 8000"
start "AutoRecruit Frontend (close window to stop)" cmd /k "cd /d %~dp0frontend && npm run dev"
echo Two server windows are opening. Once both are ready, open:
echo   http://localhost:5173
pause
