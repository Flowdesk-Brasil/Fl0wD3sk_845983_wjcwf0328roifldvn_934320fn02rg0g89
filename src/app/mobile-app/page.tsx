"use client";

import { Download, Share2, Copy, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

export default function MobileAppPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, [user, router]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setIsInstallable(false);
    }
  };

  const handleShare = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: "Corpo & Evolução",
        text: "Baixe o app de check-in para validar seus acessos",
        url: window.location.origin,
      });
    } catch (err) {
      console.error("Erro ao compartilhar:", err);
    }
  };

  const handleCopyQRCode = () => {
    const qrCodeUrl = `${window.location.origin}/api/student/qrcode/${user?.id}`;
    navigator.clipboard.writeText(qrCodeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-800 p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mt-8 mb-12">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-3xl bg-white/20 backdrop-blur mb-4">
            <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Corpo & Evolução</h1>
          <p className="text-blue-100">App de Check-in</p>
        </div>

        {/* QR Code Display */}
        <div className="bg-white rounded-3xl shadow-2xl p-6 mb-6">
          <p className="text-center text-sm font-semibold text-gray-600 mb-4">Seu QR Code</p>
          <div className="aspect-square bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <img
              src={`/api/student/qrcode/${user?.id}`}
              alt="QR Code"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="space-y-3">
            <button
              onClick={handleCopyQRCode}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition"
            >
              {copied ? (
                <>
                  <Check className="h-5 w-5" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-5 w-5" />
                  Copiar link
                </>
              )}
            </button>
            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
              <button
                onClick={handleShare}
                className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition"
              >
                <Share2 className="h-5 w-5" />
                Compartilhar
              </button>
            )}
          </div>
        </div>

        {/* User Info */}
        <div className="bg-white/10 backdrop-blur rounded-2xl p-6 mb-6 text-white">
          <p className="text-sm text-blue-100 mb-2">Seu perfil</p>
          <p className="text-xl font-bold">{user?.full_name}</p>
          <p className="text-sm text-blue-100 mt-1">{user?.email}</p>
        </div>

        {/* Installation */}
        {isInstallable && (
          <button
            onClick={handleInstall}
            className="w-full flex items-center justify-center gap-2 bg-white text-blue-600 font-bold py-4 rounded-2xl mb-4 hover:bg-blue-50 transition shadow-lg"
          >
            <Download className="h-5 w-5" />
            Instalar app
          </button>
        )}

        {/* Instructions */}
        <div className="bg-white/10 backdrop-blur rounded-2xl p-6 text-white">
          <h3 className="font-bold mb-3 text-lg">Como usar</h3>
          <ol className="space-y-2 text-sm text-blue-100">
            <li>1. Seu QR code é gerado automaticamente</li>
            <li>2. Aproxime o celular da câmera na recepção</li>
            <li>3. Aguarde a validação (verde = acesso liberado)</li>
            <li>4. Seu check-in é registrado automaticamente</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
