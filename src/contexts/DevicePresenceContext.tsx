"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { getDeviceId, getDeviceName } from "@/lib/device-id";

export type OnlineDevice = {
  deviceId: string;
  deviceName: string;
  onlineAt: string;
};

interface DevicePresenceContextType {
  onlineDevices: OnlineDevice[];
}

const DevicePresenceContext = createContext<DevicePresenceContextType>({ onlineDevices: [] });

export function DevicePresenceProvider({ children }: { children: ReactNode }) {
  const [onlineDevices, setOnlineDevices] = useState<OnlineDevice[]>([]);

  useEffect(() => {
    const deviceId = getDeviceId();
    const deviceName = getDeviceName();
    
    const channel = supabase.channel("devices-presence", {
      config: {
        presence: {
          key: deviceId,
        },
      },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const devices: OnlineDevice[] = [];
      for (const key in state) {
        const presenceData = state[key][0] as any;
        devices.push({
          deviceId: key,
          deviceName: presenceData?.deviceName || "Terminal Desconhecido",
          onlineAt: presenceData?.onlineAt,
        });
      }
      // Sort by name or time
      devices.sort((a, b) => a.deviceName.localeCompare(b.deviceName));
      setOnlineDevices(devices);
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          deviceName,
          onlineAt: new Date().toISOString(),
        });
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <DevicePresenceContext.Provider value={{ onlineDevices }}>
      {children}
    </DevicePresenceContext.Provider>
  );
}

export function useDevicePresence() {
  return useContext(DevicePresenceContext);
}
