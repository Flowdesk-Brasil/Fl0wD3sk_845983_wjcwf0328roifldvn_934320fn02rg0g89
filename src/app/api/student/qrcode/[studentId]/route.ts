import { getStudents } from "@/lib/api";
import QRCode from "qrcode";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const { studentId } = await params;
    const students = await getStudents();
    const student = students.find((s) => s.id === studentId);

    if (!student) {
      return new Response("Aluno não encontrado", { status: 404 });
    }

    // Usar o qr_code já gerado do aluno
    const qrCodeData = student.qr_code || student.id;
    const qrCodeBuffer = await QRCode.toBuffer(qrCodeData, {
      errorCorrectionLevel: "H",
      type: "png",
      margin: 1,
      width: 300,
    });

    return new Response(qrCodeBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Erro ao gerar QR code";
    return new Response(JSON.stringify({ error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
