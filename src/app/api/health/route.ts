import { useLocalData } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    dataMode: useLocalData ? "local" : "supabase",
    timestamp: new Date().toISOString(),
  });
}
