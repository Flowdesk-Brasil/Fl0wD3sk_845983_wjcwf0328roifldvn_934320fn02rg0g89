"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export function useRealtimeSync(callback: () => void) {
  useEffect(() => {
    const channel = supabase.channel("db-sync");
    
    channel.on("broadcast", { event: "DB_CHANGED" }, () => {
      callback();
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [callback]);
}
