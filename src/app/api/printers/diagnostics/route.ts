import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

type PrinterInfo = {
  name: string;
  Name?: string;
  driverName: string;
  DriverName?: string;
  portName: string;
  PortName?: string;
  printerStatus: string;
  PrinterStatus?: string | number;
  workOffline: boolean;
  WorkOffline?: boolean | null;
  default: boolean;
  Default?: boolean | null;
};

function normalizePrinter(printer: PrinterInfo): PrinterInfo {
  return {
    ...printer,
    name: printer.name ?? printer.Name ?? "",
    driverName: printer.driverName ?? printer.DriverName ?? "",
    portName: printer.portName ?? printer.PortName ?? "",
    printerStatus: String(printer.printerStatus ?? printer.PrinterStatus ?? ""),
    workOffline: Boolean(printer.workOffline ?? printer.WorkOffline ?? false),
    default: Boolean(printer.default ?? printer.Default ?? false),
  };
}

async function loadWindowsPrinters() {
  const script = `
    Get-Printer |
      Select-Object Name,DriverName,PortName,PrinterStatus,WorkOffline,Default |
      ConvertTo-Json -Compress
  `;
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, timeout: 8000 });
  const parsed = JSON.parse(stdout || "[]") as PrinterInfo | PrinterInfo[];
  return (Array.isArray(parsed) ? parsed : [parsed]).map(normalizePrinter);
}

export async function GET() {
  if (process.platform !== "win32") {
    return NextResponse.json({
      status: "unknown",
      message: "Servidor cloud detectado. O painel vai tentar a ponte local PT260 em 127.0.0.1:4217; rode npm run pt260:bridge no Windows onde a etiquetadora esta instalada.",
      printers: [],
    });
  }

  try {
    const printers = await loadWindowsPrinters();
    const labelPrinter = printers.find((printer) => /pt\s*260|pt260|diabel/i.test(`${printer.name} ${printer.driverName}`));

    if (!labelPrinter) {
      return NextResponse.json({
        status: "warning",
        message: "Nao encontrei uma impressora PT260/DIABEL instalada neste Windows. Instale o driver da fabricante e deixe a etiqueta 40x30 como tamanho padrao.",
        printers,
      });
    }

    const driver = labelPrinter.driverName || "";
    const isGenericText = /generic\s*\/\s*text|text only|somente texto/i.test(driver);
    const offline = Boolean(labelPrinter.workOffline);
    const status = String(labelPrinter.printerStatus || "").toLowerCase();

    if (isGenericText) {
      return NextResponse.json({
        status: "ok",
        message: `A ${labelPrinter.name} esta em modo RAW/texto na porta ${labelPrinter.portName}. O sistema vai enviar TSPL direto pelo spooler do Windows. Se entrar na fila e nao sair etiqueta, a PT260/firmware nao aceitou TSPL e deve usar o fallback grafico pelo driver da fabricante.`,
        printer: labelPrinter,
        printers,
      });
    }

    if (offline || status.includes("offline")) {
      return NextResponse.json({
        status: "warning",
        message: `A ${labelPrinter.name} foi encontrada, mas esta offline. Verifique USB/Bluetooth, energia e fila de impressao do Windows.`,
        printer: labelPrinter,
        printers,
      });
    }

    return NextResponse.json({
      status: "warning",
      message: `A ${labelPrinter.name} esta instalada em ${labelPrinter.portName} com driver grafico "${labelPrinter.driverName}". Impressao RAW/TSPL pode nao ser aceita por esse driver. Para direto via API, use driver RAW/Generic Text; para driver grafico, use o fallback navegador com tamanho 40x30 em 100%.`,
      printer: labelPrinter,
      printers,
    });
  } catch (error) {
    return NextResponse.json({
      status: "warning",
      message: error instanceof Error ? `Falha ao consultar impressoras do Windows: ${error.message}` : "Falha ao consultar impressoras do Windows.",
      printers: [],
    }, { status: 500 });
  }
}
