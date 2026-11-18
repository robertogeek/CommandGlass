@echo off
title CommandGlass
cd /d "%~dp0"
if not exist "client\dist\index.html" (
  echo Primera vez: instalando y compilando la interfaz...
  call npm run setup || goto :error
)
node server/src/main.ts
goto :eof

:error
echo.
echo No se ha podido preparar CommandGlass. Revisa que Node.js este instalado.
pause
