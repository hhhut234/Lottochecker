@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [1/2] 최신 당첨번호 받는 중...
python update_data.py
echo.
echo [2/2] 로또 분석을 엽니다. 이 창을 닫으면 종료됩니다.
start "" http://localhost:8765/
python -m http.server 8765 --bind 127.0.0.1
