@echo off
rem Windows: uruchamia trzy aplikacje naraz (odpowiednik start_all.command z macOS).
rem Dwuklik albo:  start_all.cmd            (z --no-open nie otwiera przegladarki)
rem Kazdy serwer dziala we wlasnym oknie - zamkniecie okna zatrzymuje serwer. Wszystko naraz zatrzymuje stop_all.cmd.
setlocal
set "ROOT=%~dp0"
set "PY="
if exist "%LOCALAPPDATA%\anaconda3\python.exe" set "PY=%LOCALAPPDATA%\anaconda3\python.exe"
if not defined PY if exist "%USERPROFILE%\anaconda3\python.exe" set "PY=%USERPROFILE%\anaconda3\python.exe"
if not defined PY if exist "%LOCALAPPDATA%\miniconda3\python.exe" set "PY=%LOCALAPPDATA%\miniconda3\python.exe"
if not defined PY if exist "%USERPROFILE%\miniconda3\python.exe" set "PY=%USERPROFILE%\miniconda3\python.exe"
if not defined PY if exist "C:\ProgramData\anaconda3\python.exe" set "PY=C:\ProgramData\anaconda3\python.exe"
if not defined PY for /f "delims=" %%P in ('where python 2^>nul ^| findstr /v /i "WindowsApps"') do if not defined PY set "PY=%%P"
if not defined PY (
  echo Nie znaleziono Pythona 3. Zainstaluj Python albo Anaconde i sprobuj ponownie.
  pause
  exit /b 1
)
echo Python: %PY%
rem bez zapisywania plikow .pyc do folderu projektu; polskie znaki w komunikatach serwerow
set PYTHONDONTWRITEBYTECODE=1
set PYTHONIOENCODING=utf-8
start "Status Hub - pokazowka (8700)" /D "%ROOT%status_hub_v3\server" "%PY%" server.py --port 8700
start "Generator awarii (8641)" /D "%ROOT%status_hub_v2\generator" "%PY%" server.py --port 8641 --realtime
rem Hub czyta dane z generatora, wiec startuje chwile po nim
ping -n 4 127.0.0.1 >nul
start "Status Hub v2 z generatorem (8642)" /D "%ROOT%status_hub_v2\hub" "%PY%" server.py --port 8642 --source http://localhost:8641
echo.
echo   Pokazowka na prawdziwych danych:  http://localhost:8700
echo   Panel generatora awarii:          http://localhost:8641
echo   Hub z generatorem:                http://localhost:8642
echo   Zatrzymanie wszystkiego:          stop_all.cmd
if /i "%~1"=="--no-open" goto :eof
ping -n 5 127.0.0.1 >nul
start "" http://localhost:8700
start "" http://localhost:8641
start "" http://localhost:8642
