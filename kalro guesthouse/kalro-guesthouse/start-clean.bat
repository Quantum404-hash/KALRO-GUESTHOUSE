@echo off
title KALRO Guesthouse (fresh start)
cd /d "%~dp0"
if exist data\kalro.db (
  echo A database already exists. A fresh start would ERASE all bookings, invoices and payments.
  echo Close this window to cancel, or press any key to erase and start fresh.
  pause >nul
  del /q data\kalro.db data\kalro.db-wal data\kalro.db-shm 2>nul
)
echo Starting fresh with KALRO's 26 rooms. Open http://localhost:3000
node --no-warnings src\server.js
pause
