#!/usr/bin/env node
"use strict";

/**
 * Ponte local PT260/DIABEL.
 *
 * Rode este processo no Windows onde a etiquetadora esta instalada:
 *   npm run pt260:bridge
 *
 * O painel na Vercel chama http://127.0.0.1:4217 a partir do navegador.
 * Isso evita a limitacao normal de servidores cloud, que nao conseguem acessar
 * USB/Bluetooth local do computador da loja.
 */

const http = require("node:http");
const { execFile } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { writeFile, unlink } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const PORT = Number(process.env.PT260_BRIDGE_PORT || 4217);
const HOST = process.env.PT260_BRIDGE_HOST || "0.0.0.0";
const PRINTER_PATTERN = /pt\s*260|pt260|diabel/i;
const VERSION = "1.2.0";

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function bridgeUrls() {
  const urls = [`http://127.0.0.1:${PORT}`];
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.push(`http://${entry.address}:${PORT}`);
      }
    }
  }
  return [...new Set(urls)];
}

function runPowerShell(script, args = [], timeout = 12000) {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script, ...args],
      { windowsHide: true, timeout },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

async function runPowerShellFile(script, args = [], timeout = 25000) {
  const scriptFile = path.join(os.tmpdir(), `corpo-evolucao-pt260-${randomUUID()}.ps1`);
  await writeFile(scriptFile, script, "utf8");

  try {
    return await new Promise((resolve, reject) => {
      execFile(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptFile, ...args],
        { windowsHide: true, timeout },
        (error, stdout, stderr) => {
          if (error) {
            error.stdout = stdout;
            error.stderr = stderr;
            reject(error);
            return;
          }
          resolve({ stdout, stderr });
        },
      );
    });
  } finally {
    unlink(scriptFile).catch(() => {});
  }
}

function normalizePrinter(printer) {
  return {
    name: printer.name || printer.Name || "",
    driverName: printer.driverName || printer.DriverName || "",
    portName: printer.portName || printer.PortName || "",
    printerStatus: String(printer.printerStatus || printer.PrinterStatus || ""),
    workOffline: Boolean(printer.workOffline || printer.WorkOffline || false),
    default: Boolean(printer.default || printer.Default || false),
  };
}

async function loadPrinters() {
  if (process.platform !== "win32") {
    return [];
  }

  const script = `
    Get-Printer |
      Select-Object Name,DriverName,PortName,PrinterStatus,WorkOffline,Default |
      ConvertTo-Json -Compress
  `;
  const { stdout } = await runPowerShell(script, [], 8000);
  const parsed = JSON.parse(stdout || "[]");
  return (Array.isArray(parsed) ? parsed : [parsed]).map(normalizePrinter);
}

function pickPrinter(printers, printerName) {
  if (printerName) {
    return printers.find((printer) => printer.name.toLowerCase() === String(printerName).toLowerCase()) || null;
  }
  return printers.find((printer) => PRINTER_PATTERN.test(`${printer.name} ${printer.driverName}`)) || null;
}

function stripText(value, maxLength = 36) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/"/g, "'")
    .slice(0, maxLength);
}

function money(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function printCode(product) {
  return product.barcode || product.primary_barcode || product.sku || product.internal_code || String(product.id || "").slice(0, 12) || "SEM-CODIGO";
}

function makeTsplLabelCommands(items) {
  return items.map((item) => {
    const product = item.product || {};
    const code = stripText(printCode(product), 48) || "SEM-CODIGO";
    const color = item.meta && item.meta.color ? item.meta.color : product.variant_color || product.variant_label || "";
    const size = item.meta && item.meta.size ? item.meta.size : product.variant_size || "";
    const variation = [color && color !== "Variacao" ? color : null, size].filter(Boolean).join(" / ") || product.unit_measure || "Produto";
    const secondary = product.sku || product.internal_code || product.category || "";
    const quantity = Math.max(1, Math.min(999, Number(item.quantity) || 1));

    return [
      "SIZE 40 mm,30 mm",
      "GAP 2 mm,0 mm",
      "DENSITY 8",
      "SPEED 2",
      "DIRECTION 1",
      "REFERENCE 0,0",
      "CLS",
      `TEXT 24,18,"2",0,1,1,"${stripText("Corpo & Evolucao", 24)}"`,
      `TEXT 250,18,"2",0,1,1,"${stripText(money(product.selling_price), 12)}"`,
      `TEXT 24,58,"3",0,1,1,"${stripText(product.name, 32)}"`,
      `TEXT 24,96,"1",0,1,1,"${stripText(variation, 24)}"`,
      `TEXT 184,96,"1",0,1,1,"${stripText("CODIGO", 12)}"`,
      `TEXT 24,120,"1",0,1,1,"${stripText("MANTER ESSA ETIQUETA EM CASO DE TROCA", 42)}"`,
      `BARCODE 92,142,"128",58,1,0,2,2,"${code}"`,
      `TEXT 106,206,"1",0,1,1,"${code}"`,
      `TEXT 24,226,"1",0,1,1,"${stripText(secondary, 20)}"`,
      `TEXT 222,226,"1",0,1,1,"${stripText(variation, 18)}"`,
      `PRINT 1,${quantity}`,
      "",
    ].join("\r\n");
  }).join("\r\n");
}

async function sendRawFileToPrinter(filePath, printerName) {
  const script = `
param([string]$PrinterName, [string]$FilePath)
$source = @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

  public static void SendFile(string printerName, string fileName) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName.Normalize(), out hPrinter, IntPtr.Zero)) {
      throw new Exception("OpenPrinter falhou: " + Marshal.GetLastWin32Error());
    }

    try {
      byte[] bytes = File.ReadAllBytes(fileName);
      IntPtr unmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
      Marshal.Copy(bytes, 0, unmanagedBytes, bytes.Length);
      try {
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Corpo e Evolucao Etiqueta 40x30";
        di.pDataType = "RAW";
        if (!StartDocPrinter(hPrinter, 1, di)) throw new Exception("StartDocPrinter falhou: " + Marshal.GetLastWin32Error());
        if (!StartPagePrinter(hPrinter)) throw new Exception("StartPagePrinter falhou: " + Marshal.GetLastWin32Error());
        int written;
        if (!WritePrinter(hPrinter, unmanagedBytes, bytes.Length, out written)) throw new Exception("WritePrinter falhou: " + Marshal.GetLastWin32Error());
        if (written != bytes.Length) throw new Exception("RAW incompleto: " + written + " de " + bytes.Length + " bytes.");
        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
      } finally {
        Marshal.FreeCoTaskMem(unmanagedBytes);
      }
    } finally {
      ClosePrinter(hPrinter);
    }
  }
}
"@
Add-Type -TypeDefinition $source -Language CSharp
[RawPrinterHelper]::SendFile($PrinterName, $FilePath)
Write-Output "RAW_OK"
  `;
  return runPowerShellFile(script, ["-PrinterName", printerName, "-FilePath", filePath], 25000);
}

function makeProtocolTestCommands(mode) {
  if (mode === 2) {
    return [
      "SIZE 40 mm,30 mm",
      "GAP 2 mm,0 mm",
      "DENSITY 8",
      "SPEED 2",
      "DIRECTION 1",
      "CLS",
      'TEXT 24,32,"3",0,1,1,"TESTE 2 TSPL LITE"',
      'TEXT 24,78,"2",0,1,1,"PT260 CORPO EVOLUCAO"',
      'BARCODE 52,126,"128",68,1,0,2,2,"260000000002"',
      "PRINT 1,1",
      "",
    ].join("\r\n");
  }

  if (mode === 3) {
    return [
      "^XA",
      "^PW320",
      "^LL240",
      "^CI28",
      "^CF0,28",
      "^FO20,24^FDTESTE 3 ZPL^FS",
      "^CF0,20",
      "^FO20,62^FDPT260 CORPO EVOLUCAO^FS",
      "^BY2,2,70",
      "^FO24,102^BCN,76,Y,N,N^FD260000000003^FS",
      "^XZ",
      "",
    ].join("\r\n");
  }

  if (mode === 4) {
    return [
      "N",
      "q320",
      "Q240,24",
      'A20,24,0,4,1,1,N,"TESTE 4 EPL"',
      'A20,64,0,3,1,1,N,"PT260 CORPO EVOLUCAO"',
      'B24,104,0,1,2,4,76,B,"260000000004"',
      "P1",
      "",
    ].join("\r\n");
  }

  return [
    "SIZE 40 mm,30 mm",
    "GAP 2 mm,0 mm",
    "DIRECTION 1",
    "REFERENCE 0,0",
    "CLS",
    'TEXT 24,32,"3",0,1,1,"TESTE 1 TSPL"',
    'TEXT 24,78,"2",0,1,1,"PT260 CORPO EVOLUCAO"',
    'BARCODE 52,126,"128",68,1,0,2,2,"260000000001"',
    "PRINT 1,1",
    "",
  ].join("\r\n");
}

async function printRawCommands(commands, printerName, prefix = "corpo-evolucao-pt260") {
  const tempFile = path.join(os.tmpdir(), `${prefix}-${randomUUID()}.prn`);
  await writeFile(tempFile, commands, "ascii");
  try {
    return await sendRawFileToPrinter(tempFile, printerName);
  } finally {
    unlink(tempFile).catch(() => {});
  }
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error("Payload muito grande para a ponte PT260."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("JSON invalido."));
      }
    });
    req.on("error", reject);
  });
}

async function handlePrinters(res) {
  const printers = await loadPrinters();
  const selectedPrinter = pickPrinter(printers);

  json(res, 200, {
    ok: true,
    service: "pt260-bridge",
    version: VERSION,
    platform: process.platform,
    status: selectedPrinter ? "ok" : "warning",
    message: selectedPrinter
      ? `PT260 encontrada: ${selectedPrinter.name} em ${selectedPrinter.portName}.`
      : "Nenhuma PT260/DIABEL encontrada neste Windows.",
    printer: selectedPrinter,
    printers,
  });
}

async function handlePrint(req, res) {
  if (process.platform !== "win32") {
    json(res, 400, {
      success: false,
      code: "unsupported_platform",
      error: "A ponte PT260 precisa rodar no Windows onde a etiquetadora esta instalada.",
    });
    return;
  }

  let tempFile = null;

  try {
    const body = await readJsonBody(req);
    const items = Array.isArray(body.items) ? body.items.filter((item) => Number(item.quantity) > 0) : [];

    if (!items.length) {
      json(res, 400, { success: false, error: "Nenhuma etiqueta selecionada para impressao." });
      return;
    }

    const printers = await loadPrinters();
    const selectedPrinter = pickPrinter(printers, body.printerName);

    if (!selectedPrinter) {
      json(res, 404, {
        success: false,
        error: "Nao encontrei a PT260/DIABEL instalada neste Windows.",
        printers,
      });
      return;
    }

    if (selectedPrinter.workOffline) {
      json(res, 409, {
        success: false,
        error: `A impressora ${selectedPrinter.name} esta offline. Verifique USB/Bluetooth, energia e fila do Windows.`,
        printer: selectedPrinter,
      });
      return;
    }

    const tspl = makeTsplLabelCommands(items);
    const labels = items.reduce((total, item) => total + Math.max(0, Number(item.quantity) || 0), 0);

    if (body.dryRun) {
      json(res, 200, {
        success: true,
        dryRun: true,
        protocol: "TSPL",
        labels,
        printer: selectedPrinter,
        commandPreview: tspl.slice(0, 1200),
      });
      return;
    }

    tempFile = path.join(os.tmpdir(), `corpo-evolucao-pt260-${randomUUID()}.prn`);
    await writeFile(tempFile, tspl, "ascii");
    const result = await sendRawFileToPrinter(tempFile, selectedPrinter.name);

    json(res, 200, {
      success: true,
      protocol: "TSPL",
      labels,
      printer: selectedPrinter,
      message: `Ponte local enviou ${labels} etiqueta(s) para ${selectedPrinter.name}.`,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (error) {
    json(res, 500, {
      success: false,
      error: error && error.message ? error.message : "Falha ao imprimir pela ponte PT260.",
    });
  } finally {
    if (tempFile) {
      unlink(tempFile).catch(() => {});
    }
  }
}

async function handleTestPrint(req, res) {
  if (process.platform !== "win32") {
    json(res, 400, {
      success: false,
      code: "unsupported_platform",
      error: "A ponte PT260 precisa rodar no Windows onde a etiquetadora esta instalada.",
    });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const mode = Math.max(1, Math.min(4, Number(body.mode) || 1));
    const printers = await loadPrinters();
    const selectedPrinter = pickPrinter(printers, body.printerName);

    if (!selectedPrinter) {
      json(res, 404, {
        success: false,
        error: "Nao encontrei a PT260/DIABEL instalada neste Windows.",
        printers,
      });
      return;
    }

    const result = await printRawCommands(makeProtocolTestCommands(mode), selectedPrinter.name, `corpo-evolucao-pt260-teste-${mode}`);
    json(res, 200, {
      success: true,
      mode,
      printer: selectedPrinter,
      message: `Teste ${mode} enviado para ${selectedPrinter.name}.`,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (error) {
    json(res, 500, {
      success: false,
      error: error && error.message ? error.message : "Falha ao enviar teste para a PT260.",
      stdout: error && error.stdout ? error.stdout : undefined,
      stderr: error && error.stderr ? error.stderr : undefined,
    });
  }
}

async function runCliProtocolTest() {
  if (process.platform !== "win32") {
    throw new Error("Os testes da PT260 precisam rodar no Windows onde a etiquetadora esta instalada.");
  }

  const testArgIndex = process.argv.indexOf("--test");
  const rawMode = testArgIndex >= 0 ? process.argv[testArgIndex + 1] : "1";
  const modes = rawMode === "all" ? [1, 2, 3, 4] : [Math.max(1, Math.min(4, Number(rawMode) || 1))];
  const printers = await loadPrinters();
  const printerArgIndex = process.argv.indexOf("--printer");
  const printerName = printerArgIndex >= 0 ? process.argv[printerArgIndex + 1] : undefined;
  const selectedPrinter = pickPrinter(printers, printerName);

  if (!selectedPrinter) {
    console.error("[pt260-bridge] Nenhuma PT260/DIABEL encontrada.");
    console.error(JSON.stringify(printers, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(`[pt260-bridge] usando impressora: ${selectedPrinter.name} (${selectedPrinter.portName})`);
  for (const mode of modes) {
    console.log(`[pt260-bridge] enviando teste ${mode}...`);
    const result = await printRawCommands(makeProtocolTestCommands(mode), selectedPrinter.name, `corpo-evolucao-pt260-teste-${mode}`);
    console.log(`[pt260-bridge] teste ${mode} enviado. ${String(result.stdout || "").trim()}`);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      json(res, 200, { ok: true });
      return;
    }

    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

    if (req.method === "GET" && url.pathname === "/health") {
      json(res, 200, {
        ok: true,
        service: "pt260-bridge",
        version: VERSION,
        platform: process.platform,
        host: HOST,
        port: PORT,
        urls: bridgeUrls(),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/printers") {
      await handlePrinters(res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/print") {
      await handlePrint(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/test-print") {
      await handleTestPrint(req, res);
      return;
    }

    json(res, 404, {
      ok: false,
      error: "Endpoint inexistente. Use GET /health, GET /printers, POST /print ou POST /test-print.",
    });
  } catch (error) {
    json(res, 500, {
      ok: false,
      error: error && error.message ? error.message : "Falha interna na ponte PT260.",
    });
  }
});

if (process.argv.includes("--test")) {
  runCliProtocolTest().catch((error) => {
    console.error(error && error.message ? error.message : error);
    if (error && error.stdout) console.error(error.stdout);
    if (error && error.stderr) console.error(error.stderr);
    process.exitCode = 1;
  });
} else {
  server.listen(PORT, HOST, () => {
    console.log(`[pt260-bridge] online em http://${HOST}:${PORT}`);
    console.log(`[pt260-bridge] URLs: ${bridgeUrls().join(" | ")}`);
    console.log("[pt260-bridge] endpoints: GET /health, GET /printers, POST /print, POST /test-print");
    console.log("[pt260-bridge] teste local: node tools/pt260-bridge/bridge.js --test all");
  });
}
