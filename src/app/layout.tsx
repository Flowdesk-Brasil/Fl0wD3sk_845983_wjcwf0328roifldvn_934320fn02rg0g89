import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Studio Corpo e Evolução | Sistema de Gestão",
  description:
    "Sistema completo de gestão para academia, studio fitness e centro de treinamento. Gerencie alunos, matrículas, pagamentos e check-ins com eficiência.",
  keywords: "academia, gestão, fitness, alunos, matrículas, pagamentos",
  authors: [{ name: "Studio Corpo e Evolução" }],
  robots: "noindex",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0a0b0f" />
      </head>
      <body className={inter.className}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
