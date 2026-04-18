import { NextRequest } from "next/server";
import { handleGoogleAuthCallback } from "@/lib/auth/googleCallback";

export async function GET(request: NextRequest) {
  return handleGoogleAuthCallback(request);
}
