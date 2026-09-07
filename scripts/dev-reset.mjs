import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command) {
  try {
    execSync(command, { cwd: siteRoot, stdio: "ignore", shell: true });
  } catch {
    // noop
  }
}

function removeDir(relativePath) {
  const target = path.join(siteRoot, relativePath);
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

console.log("\n[dev:reset] Encerrando processos Next.js deste projeto...");
if (process.platform === "win32") {
  run(
    'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match \'Fl0wD3sk.*site\' -and ($_.CommandLine -match \'next\' -or $_.CommandLine -match \'npm run dev\') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"',
  );
} else {
  run("pkill -f 'next dev' || true");
}

console.log("[dev:reset] Limpando cache .next e node_modules/.cache...");
removeDir(".next");
removeDir("node_modules/.cache");

console.log("[dev:reset] Subindo next dev...\n");
const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev"], {
  cwd: siteRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
