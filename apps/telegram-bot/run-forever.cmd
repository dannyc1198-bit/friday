@echo off
REM FRIDAY Telegram bridge supervisor — restarts the bot if it ever exits.
REM A transient Telegram 409 (e.g. a stray poll) can no longer kill it permanently.
cd /d "%~dp0"
:loop
echo [%date% %time%] starting FRIDAY telegram bridge >> bot.out.log
call npm start >> bot.out.log 2>&1
echo [%date% %time%] bridge exited (code %errorlevel%), restarting in 5s >> bot.out.log
timeout /t 5 /nobreak > nul
goto loop
