import { NextResponse } from "next/server";

import { resolveAppBaseUrl } from "@/lib/app-url";
import { replyLineText } from "@/lib/line/client";
import { verifyLineSignature } from "@/lib/line/signature";
import { handleLineEvent } from "@/lib/line/service";
import type { LineWebhookBody } from "@/lib/line/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "LINE webhook is ready."
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  try {
    if (!verifyLineSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }
  } catch (error) {
    console.error("LINE webhook signature verification failed", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Webhook verification failed."
      },
      { status: 500 }
    );
  }

  let payload: LineWebhookBody;

  try {
    payload = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  if (!payload.events.length) {
    return NextResponse.json({ ok: true });
  }

  const appBaseUrl = resolveAppBaseUrl(request) ?? new URL(request.url).origin;

  await Promise.allSettled(
    payload.events.map(async (event) => {
      if (!event.replyToken) {
        return;
      }

      try {
        const responseText = await handleLineEvent(event, appBaseUrl);

        if (responseText) {
          await replyLineText(event.replyToken, responseText);
        }
      } catch (error) {
        console.error("LINE webhook event handling failed", {
          type: event.type,
          error
        });

        try {
          await replyLineText(
            event.replyToken,
            error instanceof Error ? `處理失敗：${error.message}` : "處理訊息時發生錯誤。"
          );
        } catch (replyError) {
          console.error("LINE fallback reply failed", replyError);
        }
      }
    })
  );

  return NextResponse.json({ ok: true });
}
