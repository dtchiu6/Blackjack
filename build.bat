@echo off
echo Installing dependencies...
python -m pip install pywebview pyinstaller

echo.
echo Building Blackjack.exe...
python -m PyInstaller blackjack.spec

echo.
echo Done! Find Blackjack.exe in the dist\ folder.
echo Copy it to your desktop and double-click to play.
pause
