import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR").format(d);
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function calculateIMC(weight: number, height: number): number {
  if (!weight || !height) return 0;
  const heightInM = height / 100;
  return parseFloat((weight / (heightInM * heightInM)).toFixed(1));
}

export function getIMCClassification(imc: number): { label: string; color: string } {
  if (imc < 18.5) return { label: "Abaixo do peso", color: "text-blue-400" };
  if (imc < 25) return { label: "Peso normal", color: "text-green-400" };
  if (imc < 30) return { label: "Sobrepeso", color: "text-yellow-400" };
  if (imc < 35) return { label: "Obesidade Grau I", color: "text-orange-400" };
  if (imc < 40) return { label: "Obesidade Grau II", color: "text-red-400" };
  return { label: "Obesidade Grau III", color: "text-red-600" };
}

export function generateMatriculaNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 90000) + 10000;
  return `MAT-${year}-${random}`;
}

export function generateQRCode(studentId: string): string {
  return `QR-${studentId}-${Date.now()}`;
}

export function maskCPF(cpf: string): string {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function maskPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
}
