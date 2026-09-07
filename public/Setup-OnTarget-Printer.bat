@echo off
setlocal EnableExtensions

REM ===================================================================
REM  ON TARGET UNITED - till printer setup
REM
REM  Run this AFTER installing QZ Tray (https://qz.io/download/).
REM  Right-click this file and choose "Run as administrator".
REM
REM  It does three things and then stops:
REM    1. writes the app's certificate to C:\ProgramData\OnTarget
REM    2. tells QZ Tray to trust it, so no permission pop-up ever appears
REM    3. restarts QZ Tray so the change takes effect
REM
REM  Safe to run twice - it replaces its own settings rather than
REM  stacking them up.
REM ===================================================================

title ON TARGET UNITED - printer setup
echo.
echo   ON TARGET UNITED - till printer setup
echo   =====================================
echo.

REM ---- Administrator required: C:\Program Files is protected --------
net session >nul 2>&1
if errorlevel 1 (
  echo   [X] This must run as Administrator.
  echo.
  echo       Close this window, RIGHT-CLICK the file again and choose
  echo       "Run as administrator".
  echo.
  pause
  exit /b 1
)

REM ---- Find QZ Tray -------------------------------------------------
set "QZDIR="
if exist "%ProgramFiles%\QZ Tray\qz-tray.properties"      set "QZDIR=%ProgramFiles%\QZ Tray"
if exist "%ProgramFiles(x86)%\QZ Tray\qz-tray.properties" set "QZDIR=%ProgramFiles(x86)%\QZ Tray"

if not defined QZDIR (
  echo   [X] QZ Tray is not installed yet.
  echo.
  echo       Install it first from  https://qz.io/download/
  echo       then run this file again.
  echo.
  pause
  exit /b 1
)
echo   [1/4] Found QZ Tray:  %QZDIR%

REM ---- Write the certificate ----------------------------------------
set "CERTDIR=C:\ProgramData\OnTarget"
set "CERTFILE=%CERTDIR%\digital-certificate.txt"

if not exist "%CERTDIR%" mkdir "%CERTDIR%"

> "%CERTFILE%" echo -----BEGIN CERTIFICATE-----
>>"%CERTFILE%" echo MIID3TCCAsWgAwIBAgIURIBLZGbcrkpAjELrCu5sLEFMOAYwDQYJKoZIhvcNAQEN
>>"%CERTFILE%" echo BQAwfjELMAkGA1UEBhMCWkExFjAUBgNVBAgMDUt3YVp1bHUtTmF0YWwxDzANBgNV
>>"%CERTFILE%" echo BAcMBkR1cmJhbjEZMBcGA1UECgwQT04gVEFSR0VUIFVOSVRFRDEMMAoGA1UECwwD
>>"%CERTFILE%" echo UE9TMR0wGwYDVQQDDBRPTiBUQVJHRVQgVU5JVEVEIFBPUzAeFw0yNjA5MDcxMDM4
>>"%CERTFILE%" echo NDdaFw0zNjA5MDQxMDM4NDdaMH4xCzAJBgNVBAYTAlpBMRYwFAYDVQQIDA1Ld2Fa
>>"%CERTFILE%" echo dWx1LU5hdGFsMQ8wDQYDVQQHDAZEdXJiYW4xGTAXBgNVBAoMEE9OIFRBUkdFVCBV
>>"%CERTFILE%" echo TklURUQxDDAKBgNVBAsMA1BPUzEdMBsGA1UEAwwUT04gVEFSR0VUIFVOSVRFRCBQ
>>"%CERTFILE%" echo T1MwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC3xT4fBOx8F2r6a6d+
>>"%CERTFILE%" echo tJHhsdcYmo1MhF9CUO2u2e+RL3I1Lc+bnmgIdyqbFsXplYvqUMTWKU82nqRsTW22
>>"%CERTFILE%" echo UKmBCxkW68IrHevPbyCjic/cbCY9/IlnCAjbrBC+zQ5CLkrunylhaMzNICSRnPN2
>>"%CERTFILE%" echo F0UQIFXJcSSYlsp/br9IM7HpIYEk3vM8OIhayo/7vxtuuKSmVSm6PBDbbRIEF4bb
>>"%CERTFILE%" echo IxOW0Tu+EQ/j4e+o5Cb5KfyfLWeVQvSIdQWuQxyc6TXjO+PQsiqzTbWs5pB2C9Ah
>>"%CERTFILE%" echo tAjzs01E/JYXNzXyHXALvetwzpbRLzEIHG8OdurtiZi00zm4JtBIa5sZmKW+XPpA
>>"%CERTFILE%" echo BW1jAgMBAAGjUzBRMB0GA1UdDgQWBBTzKlS2DSF1HXsCug6Qsn0BiC0c3jAfBgNV
>>"%CERTFILE%" echo HSMEGDAWgBTzKlS2DSF1HXsCug6Qsn0BiC0c3jAPBgNVHRMBAf8EBTADAQH/MA0G
>>"%CERTFILE%" echo CSqGSIb3DQEBDQUAA4IBAQBCc2uiTWxnmXwUoFo+zllA6w7pnR752hjkNqOKpf3f
>>"%CERTFILE%" echo 6WhJXg5NT6gupvPTmnawiWn4qfznAbHFnsZRcCUllX4R2nqLpPxiuKPafw/q22fJ
>>"%CERTFILE%" echo 9lIUQy+az+uM0aPkn4wIjHgUawwxurF0r6WlUQ1PtsiE1CkXYxi9rlYRAxPEmV15
>>"%CERTFILE%" echo zTzNPP+awwaPF6P5sTVAsux5jOWL18NSXky7Y1JDpms5HAnAc0qHdqKugRZfRTwv
>>"%CERTFILE%" echo Ze1vDlmwfaqdwhMj0ds7sWPjWq3ybUBd5oEut+14fp4RfpfYsQgadWj3qNRj4o7E
>>"%CERTFILE%" echo khh/4MPaSQb1eioc82qw/lsZ50FdDA6Htz0qqSUjlShK
>>"%CERTFILE%" echo -----END CERTIFICATE-----

if not exist "%CERTFILE%" (
  echo   [X] Could not write the certificate to %CERTFILE%
  echo.
  pause
  exit /b 1
)
echo   [2/4] Certificate written:  %CERTFILE%

REM ---- Point QZ Tray at it ------------------------------------------
REM  Any previous authcert.override line is dropped first, so running
REM  this twice cannot leave two of them behind.
set "PROPS=%QZDIR%\qz-tray.properties"
set "TMPPROPS=%TEMP%\qz-tray.properties.new"

findstr /v /b /c:"authcert.override=" "%PROPS%" > "%TMPPROPS%"
>>"%TMPPROPS%" echo authcert.override=%CERTFILE%

copy /y "%PROPS%" "%PROPS%.backup" >nul
copy /y "%TMPPROPS%" "%PROPS%" >nul
del "%TMPPROPS%" >nul 2>&1

findstr /b /c:"authcert.override=" "%PROPS%" >nul
if errorlevel 1 (
  echo   [X] Could not update %PROPS%
  echo.
  pause
  exit /b 1
)
echo   [3/4] QZ Tray told to trust it  (old file kept as qz-tray.properties.backup)

REM ---- Restart QZ Tray so it reads the new setting -------------------
taskkill /im qz-tray.exe /f >nul 2>&1
timeout /t 2 /nobreak >nul
start "" "%QZDIR%\qz-tray.exe"
echo   [4/4] QZ Tray restarted

echo.
echo   ================================================================
echo    Done.
echo.
echo    Now open the app and print one small invoice (2-3 items) and
echo    one large one (20+ items).
echo.
echo    What should happen:
echo      - no print dialog, the slip comes straight out
echo      - no permission pop-up
echo      - the small slip is SHORT, the large one is LONGER
echo      - the paper is cut just below the last line
echo.
echo    One last thing, by hand: right-click the QZ Tray icon near the
echo    clock, choose Advanced, and tick "Start automatically". Without
echo    it printing goes back to the old behaviour after a restart.
echo   ================================================================
echo.
pause
