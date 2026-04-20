import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { resolveAppBaseUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { getProductionEnvChecklist } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const env = getProductionEnvChecklist();
  const appBaseUrl = resolveAppBaseUrl(request);

  let database = {
    ok: false,
    message: "Database check was not executed."
  };

  try {
    await db.$queryRaw(Prisma.sql`SELECT 1`);
    database = {
      ok: true,
      message: "Database connection is healthy."
    };
  } catch (error) {
    database = {
      ok: false,
      message: error instanceof Error ? error.message : "Database connection failed."
    };
  }

  const ok =
    database.ok &&
    env.databaseUrl &&
    env.directDatabaseUrl &&
    env.appBaseUrl &&
    env.lineChannelSecret &&
    env.lineChannelAccessToken;

  return NextResponse.json(
    {
      ok,
      timestamp: new Date().toISOString(),
      appBaseUrl,
      checks: {
        env,
        database
      }
    },
    { status: ok ? 200 : 503 }
  );
}
