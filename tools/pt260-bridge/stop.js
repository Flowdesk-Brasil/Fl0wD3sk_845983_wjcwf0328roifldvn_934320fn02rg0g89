#!/usr/bin/env node
"use strict";

const { execFile } = require("node:child_process");

const port = Number(process.env.PT260_BRIDGE_PORT || 4217);

const script = `
$connections = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue
if (-not $connections) {
  Write-Output "Nenhuma ponte PT260 ativa na porta ${port}."
  exit 0
}

$connections | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
  Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
  Write-Output "Ponte PT260 encerrada: PID $_"
}
`;

execFile(
  "powershell.exe",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
  { windowsHide: true, timeout: 10000 },
  (error, stdout, stderr) => {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    if (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  },
);
