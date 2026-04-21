import { NextResponse } from "next/server";

import { resolveAppBaseUrl } from "@/lib/app-url";
import { db } from "@/lib/db";

type Props = {
  params: {
    token: string;
  };
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanOptionalString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function redirectToTokenPage(
  token: string,
  baseUrl: string,
  searchParams?: Record<string, string>
) {
  const url = new URL(`/member-settings/${token}`, baseUrl);

  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: Request, { params }: Props) {
  const baseUrl = resolveAppBaseUrl(request) ?? new URL(request.url).origin;
  return redirectToTokenPage(params.token, baseUrl, {
    error: "這個連結已停用，請改成私聊 Bot 輸入「設定收款」。"
  });
}
