import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { makeTsplLabelCommands, type ProductLabelPrintItem } from "@/lib/product-labels";

const execFileAsync = promisify(execFile);

type PrinterInfo = {
  Name?: string;
  DriverName?: string;
  PortName?: string;
  PrinterStatus?: string | number;
  WorkOffline?: boolean | null;
  name?: string;
  driverName?: string;
  portName?: string;
  printerStatus?: string | number;
  workOffline?: boolean | null;
};

function normalizePrinter(printer: PrinterInfo) {
  return {
    name: printer.name ?? printer.Name ?? "",
    driverName: printer.driverName ?? printer.DriverName ?? "",
    portName: printer.portName ?? printer.PortName ?? "",
    printerStatus: String(printer.printerStatus ?? printer.PrinterStatus ?? ""),
    workOffline: Boolean(printer.workOffline ?? printer.WorkOffline ?? false),
  };
}

async function loadWindowsPrinters() {
  const script = `
    Get-Printer |
      Select-Object Name,DriverName,PortName,PrinterStatus,WorkOffline |
      ConvertTo-Json -Compress
  `;
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, timeout: 8000 });
  const parsed = JSON.parse(stdout || "[]") as PrinterInfo | PrinterInfo[];
  return (Array.isArray(parsed) ? parsed : [parsed]).map(normalizePrinter);
}

async function sendRawFileToPrinter(filePath: string, printerName: string) {
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

  const { stdout, stderr } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script, printerName, filePath],
    { windowsHide: true, timeout: 20000 },
  );
  return { target: printerName, stdout, stderr };
}

export async function POST(req: Request) {
  if (process.platform !== "win32") {
    return NextResponse.json({
      success: false,
      code: "unsupported_platform",
      error: "Servidor cloud detectado. A API da Vercel nao acessa USB/Bluetooth local; use a ponte PT260 em http://127.0.0.1:4217 no Windows da etiquetadora.",
    }, { status: 400 });
  }

  let tempFile: string | null = null;

  try {
    const body = await req.json() as { items?: ProductLabelPrintItem[]; printerName?: string; dryRun?: boolean };
    const items = (body.items ?? []).filter((item) => item.quantity > 0);
    if (!items.length) {
      return NextResponse.json({ success: false, error: "Nenhuma etiqueta selecionada para impressao direta." }, { status: 400 });
    }

    const printers = await loadWindowsPrinters();
    const selectedPrinter = printers.find((printer) =>
      body.printerName
        ? printer.name.toLowerCase() === body.printerName.toLowerCase()
        : /pt\s*260|pt260|diabel/i.test(`${printer.name} ${printer.driverName}`),
    );

    if (!selectedPrinter) {
      return NextResponse.json({
        success: false,
        error: "Nao encontrei a PT260/DIABEL instalada neste Windows.",
        printers,
      }, { status: 404 });
    }

    if (selectedPrinter.workOffline) {
      return NextResponse.json({
        success: false,
        error: `A impressora ${selectedPrinter.name} esta offline. Verifique cabo/energia/Bluetooth e limpe a fila do Windows.`,
        printer: selectedPrinter,
      }, { status: 409 });
    }

    const tspl = makeTsplLabelCommands(items);
    if (body.dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        protocol: "TSPL",
        printer: selectedPrinter,
        labels: items.reduce((total, item) => total + item.quantity, 0),
        commandPreview: tspl.slice(0, 1200),
      });
    }

    tempFile = path.join(tmpdir(), `corpo-evolucao-label-${randomUUID()}.prn`);
    await writeFile(tempFile, tspl, "ascii");

    const result = await sendRawFileToPrinter(tempFile, selectedPrinter.name);

    return NextResponse.json({
      success: true,
      protocol: "TSPL",
      printer: selectedPrinter,
      target: result.target,
      labels: items.reduce((total, item) => total + item.quantity, 0),
      message: `RAW TSPL enviado para ${selectedPrinter.name}. Se a fila receber e nao imprimir, a PT260/driver nao aceitou TSPL direto e deve usar o fallback grafico.`,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Falha ao enviar comandos para a impressora.",
    }, { status: 500 });
  } finally {
    if (tempFile) {
      await unlink(tempFile).catch(() => {});
    }
  }
}
