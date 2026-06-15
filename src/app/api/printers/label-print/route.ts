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

async function sendRawFileToPrinter(filePath: string, printerName: string, portName?: string) {
  const printExe = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "print.exe");
  const attempts = [
    { target: printerName, args: [`/D:${printerName}`, filePath] },
    ...(portName ? [{ target: portName, args: [`/D:${portName}`, filePath] }] : []),
  ];

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const { stdout, stderr } = await execFileAsync(printExe, attempt.args, { windowsHide: true, timeout: 15000 });
      return { target: attempt.target, stdout, stderr };
    } catch (error: any) {
      errors.push(`${attempt.target}: ${error?.stderr || error?.stdout || error?.message || "falha desconhecida"}`);
    }
  }

  throw new Error(errors.join(" | "));
}

export async function POST(req: Request) {
  if (process.platform !== "win32") {
    return NextResponse.json({
      success: false,
      code: "unsupported_platform",
      error: "Impressao direta USB/Bluetooth precisa rodar no Windows onde a PT260 esta instalada. Em Vercel/Linux o servidor nao tem acesso a sua impressora local.",
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

    const result = await sendRawFileToPrinter(tempFile, selectedPrinter.name, selectedPrinter.portName);

    return NextResponse.json({
      success: true,
      protocol: "TSPL",
      printer: selectedPrinter,
      target: result.target,
      labels: items.reduce((total, item) => total + item.quantity, 0),
      message: `Comando TSPL enviado para ${selectedPrinter.name}.`,
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
