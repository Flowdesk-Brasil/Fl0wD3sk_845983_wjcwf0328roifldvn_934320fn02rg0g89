@echo off
setlocal EnableExtensions

title Corpo e Evolucao - Ponte PT260
cd /d "%~dp0"
cls

echo ============================================================
echo  Corpo e Evolucao - Ponte local da etiquetadora PT260
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao foi encontrado neste Windows.
  echo Instale o Node.js LTS e execute este arquivo novamente.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERRO] npm nao foi encontrado neste Windows.
  echo Reinstale o Node.js marcando a opcao de instalar o npm.
  echo.
  pause
  exit /b 1
)

if not exist package.json (
  echo [ERRO] Este arquivo precisa ser executado dentro da pasta do projeto.
  echo Pasta atual: %CD%
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [AVISO] A pasta node_modules nao existe.
  echo Rode npm install antes de iniciar a ponte, se este computador ainda nao foi preparado.
  echo.
)

echo [1/2] Encerrando ponte antiga da PT260, se existir...
call npm run pt260:stop
if errorlevel 1 (
  echo [AVISO] Nao consegui encerrar uma ponte antiga automaticamente.
  echo Se a porta 4217 continuar ocupada, feche os terminais antigos manualmente.
  echo.
)

echo.
echo [2/2] Iniciando ponte local da PT260...
echo.
echo Deixe esta janela aberta enquanto for imprimir etiquetas.
echo No painel da Vercel, use a URL http://127.0.0.1:4217 quando abrir no mesmo Windows da PT260.
echo Se abrir o painel em outro computador da rede, use a URL com IP que a ponte vai mostrar abaixo.
echo.

call npm run pt260:bridge
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" (
  echo [ERRO] A ponte PT260 foi encerrada com falha. Codigo: %EXIT_CODE%
) else (
  echo [OK] A ponte PT260 foi encerrada normalmente.
)
echo.
pause
exit /b %EXIT_CODE%
