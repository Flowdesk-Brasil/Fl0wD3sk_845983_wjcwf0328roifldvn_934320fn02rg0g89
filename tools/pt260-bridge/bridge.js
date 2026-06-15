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
const { access, readFile, writeFile, unlink, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const PORT = Number(process.env.PT260_BRIDGE_PORT || 4217);
const HOST = process.env.PT260_BRIDGE_HOST || "0.0.0.0";
const PRINTER_PATTERN = /pt\s*260|pt260|diabel/i;
const VERSION = "1.3.0";
const LABEL_WIDTH_PX = 480;
const LABEL_HEIGHT_PX = 360;
const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const LABEL_TEMPLATE_PATH = path.join(PUBLIC_DIR, "Etiq-model.svg");
const LABEL_LOGO_PATH = path.join(PUBLIC_DIR, "imagotipo.svg");

const CODE_128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

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

function runExecutable(file, args = [], timeout = 30000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
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

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function code128Values(value) {
  const safe = String(value || "SEM-CODIGO").replace(/[^\x20-\x7E]/g, "").slice(0, 48) || "SEM-CODIGO";
  const values = [...safe].map((char) => char.charCodeAt(0) - 32);
  const startCodeB = 104;
  let checksum = startCodeB;
  values.forEach((code, index) => {
    checksum += code * (index + 1);
  });
  return {
    text: safe,
    sequence: [startCodeB, ...values, checksum % 103, 106],
  };
}

function code128SvgMarkup(value, height = 92) {
  const { sequence } = code128Values(value);
  let x = 0;
  const bars = [];

  for (const code of sequence) {
    const pattern = CODE_128_PATTERNS[code];
    for (let index = 0; index < pattern.length; index++) {
      const width = Number(pattern[index]);
      if (index % 2 === 0) {
        bars.push(`<rect x="${x}" y="0" width="${width}" height="${height}" />`);
      }
      x += width;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} ${height}" preserveAspectRatio="none" aria-hidden="true">${bars.join("")}</svg>`;
}

async function fileDataUri(filePath, mimeType) {
  const buffer = await readFile(filePath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function makeHtmlLabelDocument(item) {
  const product = item.product || {};
  const code = printCode(product);
  const size = item.meta && item.meta.size ? item.meta.size : product.variant_size || "";
  const color = item.meta && item.meta.color ? item.meta.color : product.variant_color || product.variant_label || "";
  const hasSize = Boolean(String(size).trim());
  const secondary = [product.sku, product.internal_code].filter(Boolean).join(" | ");
  const footerLeft = color && color !== "Variacao" ? color : product.unit_measure || product.category || "Produto";
  const footerRight = secondary || product.brand || "";
  const templateDataUri = await fileDataUri(LABEL_TEMPLATE_PATH, "image/svg+xml");
  const logoDataUri = await fileDataUri(LABEL_LOGO_PATH, "image/svg+xml");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${LABEL_WIDTH_PX}, initial-scale=1">
<title>Etiqueta 40x30mm</title>
<style>
  * { box-sizing: border-box; }

  html,
  body {
    width: ${LABEL_WIDTH_PX}px;
    height: ${LABEL_HEIGHT_PX}px;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: #fff;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
  }

  .etiqueta {
    position: relative;
    width: ${LABEL_WIDTH_PX}px;
    height: ${LABEL_HEIGHT_PX}px;
    overflow: hidden;
    background-color: #fff;
    background-image: url("${templateDataUri}");
    background-size: 100% 100%;
    background-position: center;
    background-repeat: no-repeat;
  }

  .mascara-logo {
    position: absolute;
    left: 123px;
    top: 11px;
    width: 234px;
    height: 66px;
    background: #fff;
  }

  .logo {
    position: absolute;
    left: 127px;
    top: 15px;
    width: 225px;
    height: 56px;
    object-fit: fill;
    display: block;
    filter: brightness(0);
  }

  .label-preco,
  .label-produto,
  .label-tamanho,
  .label-codigo,
  .label-rodape {
    position: absolute;
    z-index: 3;
    color: #000;
    line-height: 1;
    text-transform: uppercase;
  }

  .label-preco {
    right: 31px;
    top: 33px;
    width: 110px;
    font-size: 20px;
    font-weight: 950;
    text-align: center;
    white-space: nowrap;
  }

  .label-produto {
    left: 40px;
    right: 40px;
    top: 107px;
    height: 53px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    font-size: 24px;
    font-weight: 950;
    text-align: center;
    letter-spacing: 0;
  }

  .label-tamanho {
    left: 37px;
    top: 199px;
    width: 80px;
    height: 80px;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: #fff;
    font-size: 33px;
    font-weight: 950;
    text-align: center;
  }

  .label-barcode {
    position: absolute;
    z-index: 3;
    left: 144px;
    right: 40px;
    top: 193px;
    height: 82px;
    background: #fff;
  }

  .label-barcode svg {
    display: block;
    width: 100%;
    height: 100%;
    fill: #000;
  }

  .label-codigo {
    left: 144px;
    right: 40px;
    top: 277px;
    overflow: hidden;
    background: #fff;
    font-family: "Arial Narrow", Arial, Helvetica, sans-serif;
    font-size: 15px;
    font-weight: 900;
    text-align: center;
    white-space: nowrap;
  }

  .label-rodape {
    left: 155px;
    right: 35px;
    bottom: 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    overflow: hidden;
    background: #fff;
    font-size: 14px;
    font-weight: 900;
  }

  .label-rodape span {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .etiqueta-sem-tamanho .label-tamanho {
    display: none;
  }

  .etiqueta-sem-tamanho .label-barcode {
    left: 62px;
    right: 62px;
    top: 187px;
    height: 88px;
  }

  .etiqueta-sem-tamanho .label-codigo {
    left: 62px;
    right: 62px;
    top: 279px;
  }

  .etiqueta-sem-tamanho .label-rodape {
    left: 62px;
    right: 62px;
  }
</style>
</head>
<body>
  <div class="etiqueta${hasSize ? "" : " etiqueta-sem-tamanho"}" aria-label="Etiqueta 40x30mm">
    <div class="mascara-logo"></div>
    <img class="logo" alt="Logo" src="${logoDataUri}">
    <strong class="label-preco">${htmlEscape(money(product.selling_price))}</strong>
    <strong class="label-produto">${htmlEscape(product.name || "PRODUTO")}</strong>
    ${hasSize ? `<span class="label-tamanho">${htmlEscape(size)}</span>` : ""}
    <div class="label-barcode">${code128SvgMarkup(code, 92)}</div>
    <div class="label-codigo">${htmlEscape(code)}</div>
    <div class="label-rodape">
      <span>${htmlEscape(footerLeft)}</span>
      <span>${htmlEscape(footerRight)}</span>
    </div>
  </div>
</body>
</html>`;
}

function makeTsplLabelCommands(items) {
  return items.map((item) => {
    const product = item.product || {};
    const code = stripText(printCode(product), 48) || "SEM-CODIGO";
    const color = item.meta && item.meta.color ? item.meta.color : product.variant_color || product.variant_label || "";
    const size = item.meta && item.meta.size ? item.meta.size : product.variant_size || "";
    const hasSize = Boolean(size);
    const variation = [color && color !== "Variacao" ? color : null, size].filter(Boolean).join(" / ") || product.unit_measure || "Produto";
    const secondary = product.sku || product.internal_code || product.category || "";
    const quantity = Math.max(1, Math.min(999, Number(item.quantity) || 1));
    const barcodeX = hasSize ? 92 : 42;
    const codeX = hasSize ? 106 : 62;

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
      ...(hasSize ? [
        "BOX 25,132,78,190,2",
        `TEXT 38,151,"3",0,1,1,"${stripText(size, 8)}"`,
      ] : []),
      `TEXT 24,120,"1",0,1,1,"${stripText("MANTER ESSA ETIQUETA EM CASO DE TROCA", 42)}"`,
      `BARCODE ${barcodeX},142,"128",58,1,0,2,2,"${code}"`,
      `TEXT ${codeX},206,"1",0,1,1,"${code}"`,
      `TEXT ${hasSize ? 104 : 42},226,"1",0,1,1,"${stripText(secondary || variation, hasSize ? 20 : 32)}"`,
      ...(hasSize ? [`TEXT 222,226,"1",0,1,1,"${stripText(variation, 18)}"`] : []),
      `PRINT 1,${quantity}`,
      "",
    ].join("\r\n");
  }).join("\r\n");
}

function expandPrintItems(items) {
  const labels = [];
  for (const item of items) {
    const quantity = Math.max(1, Math.min(999, Number(item.quantity) || 1));
    for (let index = 0; index < quantity; index++) {
      labels.push({ ...item, quantity: 1 });
    }
  }
  return labels;
}

async function firstExistingPath(paths) {
  for (const candidate of paths.filter(Boolean)) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }
  return null;
}

async function findChromiumExecutable() {
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

  return firstExistingPath([
    path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    localAppData && path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    localAppData && path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
  ]);
}

async function renderHtmlLabelToPng(item) {
  const browserPath = await findChromiumExecutable();
  if (!browserPath) {
    throw new Error("Nao encontrei Microsoft Edge ou Chrome para converter o HTML da etiqueta em imagem. Instale/atualize o Edge no Windows da PT260.");
  }

  const token = randomUUID();
  const htmlFile = path.join(os.tmpdir(), `corpo-evolucao-label-${token}.html`);
  const pngFile = path.join(os.tmpdir(), `corpo-evolucao-label-${token}.png`);
  const userDataDir = path.join(os.tmpdir(), `corpo-evolucao-edge-${token}`);

  await writeFile(htmlFile, await makeHtmlLabelDocument(item), "utf8");

  try {
    await runExecutable(browserPath, [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-sync",
      "--hide-scrollbars",
      "--no-first-run",
      `--user-data-dir=${userDataDir}`,
      `--screenshot=${pngFile}`,
      `--window-size=${LABEL_WIDTH_PX},${LABEL_HEIGHT_PX}`,
      pathToFileURL(htmlFile).href,
    ], 30000);

    return { pngFile, cleanup: [htmlFile, userDataDir] };
  } catch (error) {
    rm(htmlFile, { force: true }).catch(() => {});
    rm(pngFile, { force: true }).catch(() => {});
    rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function printImageToPrinter(imagePath, printerName) {
  const script = `
param([string]$PrinterName, [string]$ImagePath)
Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile($ImagePath)
try {
  $printDoc = New-Object System.Drawing.Printing.PrintDocument
  $printDoc.DocumentName = "Corpo e Evolucao Etiqueta HTML 40x30"
  $printDoc.PrinterSettings.PrinterName = $PrinterName
  if (-not $printDoc.PrinterSettings.IsValid) {
    throw "Impressora invalida ou indisponivel: $PrinterName"
  }
  $printDoc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize("40x30mm", 157, 118)
  $printDoc.DefaultPageSettings.Landscape = $false
  $printDoc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  $printDoc.OriginAtMargins = $false

  $printDoc.add_PrintPage({
    param($sender, $event)
    $event.Graphics.PageUnit = [System.Drawing.GraphicsUnit]::Display
    $event.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $event.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
    $event.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $bounds = $event.PageBounds
    $event.Graphics.DrawImage($image, $bounds.X, $bounds.Y, $bounds.Width, $bounds.Height)
    $event.HasMorePages = $false
  })

  $printDoc.Print()
  Write-Output "IMAGE_OK"
} finally {
  $image.Dispose()
}
  `;

  return runPowerShellFile(script, ["-PrinterName", printerName, "-ImagePath", imagePath], 30000);
}

async function makeTsplBitmapFileFromPng(imagePath) {
  const rawFile = path.join(os.tmpdir(), `corpo-evolucao-label-bitmap-${randomUUID()}.prn`);
  const script = `
param([string]$ImagePath, [string]$OutputPath)
Add-Type -AssemblyName System.Drawing
$width = 320
$height = 240
$bytesPerRow = [Math]::Ceiling($width / 8)
$source = [System.Drawing.Image]::FromFile($ImagePath)
$bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.Clear([System.Drawing.Color]::White)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.DrawImage($source, 0, 0, $width, $height)

  $hex = New-Object System.Text.StringBuilder
  for ($y = 0; $y -lt $height; $y++) {
    for ($byteX = 0; $byteX -lt $bytesPerRow; $byteX++) {
      $value = 0
      for ($bit = 0; $bit -lt 8; $bit++) {
        $x = ($byteX * 8) + $bit
        if ($x -lt $width) {
          $pixel = $bitmap.GetPixel($x, $y)
          $luma = (0.299 * $pixel.R) + (0.587 * $pixel.G) + (0.114 * $pixel.B)
          if ($luma -lt 168) {
            $value = $value -bor (0x80 -shr $bit)
          }
        }
      }
      [void]$hex.Append($value.ToString("X2"))
    }
  }

  $commands = @(
    "SIZE 40 mm,30 mm",
    "GAP 2 mm,0 mm",
    "DENSITY 10",
    "SPEED 2",
    "DIRECTION 1",
    "REFERENCE 0,0",
    "CLS",
    "BITMAP 0,0,$bytesPerRow,$height,0,$($hex.ToString())",
    "PRINT 1,1",
    ""
  ) -join "\`r\`n"
  [System.IO.File]::WriteAllText($OutputPath, $commands, [System.Text.Encoding]::ASCII)
  Write-Output "BITMAP_OK"
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
  $source.Dispose()
}
  `;

  try {
    await runPowerShellFile(script, ["-ImagePath", imagePath, "-OutputPath", rawFile], 45000);
    return rawFile;
  } catch (error) {
    rm(rawFile, { force: true }).catch(() => {});
    throw error;
  }
}

async function printHtmlLabels(items, printerName) {
  const labels = expandPrintItems(items);
  const cleanupPaths = [];
  let stdout = "";
  let stderr = "";

  try {
    for (const item of labels) {
      const rendered = await renderHtmlLabelToPng(item);
      cleanupPaths.push(rendered.pngFile, ...rendered.cleanup);
      const rawBitmapFile = await makeTsplBitmapFileFromPng(rendered.pngFile);
      cleanupPaths.push(rawBitmapFile);
      const result = await sendRawFileToPrinter(rawBitmapFile, printerName);
      stdout += result.stdout || "";
      stderr += result.stderr || "";
    }
  } finally {
    for (const cleanupPath of cleanupPaths) {
      rm(cleanupPath, { recursive: true, force: true }).catch(() => {});
    }
  }

  return { labels: labels.length, stdout, stderr };
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

    const labels = items.reduce((total, item) => total + Math.max(0, Number(item.quantity) || 0), 0);

    if (body.dryRun) {
      json(res, 200, {
        success: true,
        dryRun: true,
        protocol: "HTML_BITMAP",
        labels,
        printer: selectedPrinter,
        htmlPreview: (await makeHtmlLabelDocument({ ...items[0], quantity: 1 })).slice(0, 3000),
      });
      return;
    }

    const result = await printHtmlLabels(items, selectedPrinter.name);

    json(res, 200, {
      success: true,
      protocol: "HTML_BITMAP",
      labels: result.labels,
      printer: selectedPrinter,
      message: `Ponte local renderizou o HTML em imagem, rasterizou em bitmap 40x30 e enviou ${result.labels} etiqueta(s) para ${selectedPrinter.name}.`,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (error) {
    json(res, 500, {
      success: false,
      error: error && error.message ? error.message : "Falha ao imprimir pela ponte PT260.",
    });
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
