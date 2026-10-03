@echo off
rem Exam Studio launcher (double-click to start)
cd /d "%~dp0"
set PY=python
where py >nul 2>nul && set PY=py
%PY% -c "import docx" 2>nul
if errorlevel 1 (
  echo Installing python-docx ...
  %PY% -m pip install --user python-docx
)
%PY% -m exam_app.ui
if errorlevel 1 (
  echo.
  echo Failed to start. Please check that Python is installed: https://www.python.org/
)
pause
