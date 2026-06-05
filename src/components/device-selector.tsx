"use client";

import { useState } from "react";
import { Modal } from "@/components/ui";
import { useDevicePresence } from "@/contexts/DevicePresenceContext";
import { MonitorSmartphone } from "lucide-react";
import { getDeviceId } from "@/lib/device-id";

export function useDeviceSelector() {
  const { onlineDevices } = useDevicePresence();
  const [open, setOpen] = useState(false);
  const [resolver, setResolver] = useState<{ resolve: (deviceId: string | null) => void } | null>(null);

  const selectDevice = async (): Promise<string | null> => {
    const myId = getDeviceId();
    const otherDevices = onlineDevices.filter(d => d.deviceId !== myId);
    
    if (otherDevices.length === 0) {
      return ""; // No other devices, send global by default (though it shouldn't matter)
    }
    if (otherDevices.length === 1) {
      return otherDevices[0].deviceId;
    }

    setOpen(true);
    return new Promise((resolve) => {
      setResolver({ resolve });
    });
  };

  const handleSelect = (deviceId: string) => {
    setOpen(false);
    if (resolver) resolver.resolve(deviceId);
    setResolver(null);
  };

  const handleClose = () => {
    setOpen(false);
    if (resolver) resolver.resolve(null);
    setResolver(null);
  };

  const myId = typeof window !== "undefined" ? getDeviceId() : "";
  const otherDevices = onlineDevices.filter(d => d.deviceId !== myId);

  const modal = (
    <Modal open={open} onClose={handleClose} title="Selecionar Terminal" description="Para qual aparelho você deseja enviar este comando?">
      <div className="grid gap-3 p-4">
        <button onClick={() => handleSelect("")} className="flex items-center gap-4 rounded-xl border border-[#e3e8f0] p-4 text-left transition hover:border-blue-500 hover:bg-blue-50">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-100 text-blue-600">
            <MonitorSmartphone className="h-5 w-5" />
          </div>
          <div>
            <strong className="block text-sm font-bold text-[#172033]">Todos os Terminais</strong>
            <span className="text-xs text-[#657085]">Enviar para todos os aparelhos conectados</span>
          </div>
        </button>
        {otherDevices.map(device => (
          <button key={device.deviceId} onClick={() => handleSelect(device.deviceId)} className="flex items-center gap-4 rounded-xl border border-[#e3e8f0] p-4 text-left transition hover:border-blue-500 hover:bg-blue-50">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
              <MonitorSmartphone className="h-5 w-5" />
            </div>
            <div>
              <strong className="block text-sm font-bold text-[#172033]">{device.deviceName}</strong>
              <span className="text-xs text-[#657085]">Dispositivo logado ativamente</span>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );

  return { selectDevice, DeviceSelectorModal: () => modal };
}
