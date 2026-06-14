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
      message: "Diagnostico local de impressora so esta disponivel no Windows onde a etiquetadora esta instalada.",
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
        status: "warning",
        message: `A ${labelPrinter.name} esta instalada na porta ${labelPrinter.portName}, mas usa o driver "${labelPrinter.driverName}". Esse driver e somente texto e nao imprime etiqueta grafica com SVG/codigo de barras. Troque para o driver grafico da DIABEL/PT260 no Windows.`,
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
      status: "ok",
      message: `A ${labelPrinter.name} esta instalada em ${labelPrinter.portName} com driver "${labelPrinter.driverName}". Se ainda nao imprimir, limpe a fila e confirme o tamanho 40x30 nas preferencias do driver.`,
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
