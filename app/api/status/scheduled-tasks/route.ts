import { NextResponse } from "next/server";
import {
  checkScheduledTasksStatus,
  stabilizeStatusCheckResult,
} from "../../../../lib/status/monitors";
import { PUBLIC_STATUS_CACHE_HEADER } from "@/lib/http/publicCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = stabilizeStatusCheckResult(
      "scheduled_tasks",
      await checkScheduledTasksStatus(),
    );
    return NextResponse.json(payload, {
      status: payload.ok ? 200 : 500,
      headers: { "Cache-Control": PUBLIC_STATUS_CACHE_HEADER },
    });
  } catch (error) {
    console.error("Scheduled tasks status check failed:", error);

    return NextResponse.json(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        latencyMs: null,
        status: "major_outage",
        message: "Falha critica ao verificar o sistema de tarefas agendadas.",
        stats: {
          pendingTasks: 0,
          overdueTasks: 0,
          processingTasks: 0,
          completedToday: 0,
        },
        source: "scheduled_tasks",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
