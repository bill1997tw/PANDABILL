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

  const member = await db.member.findUnique({
    where: {
      paymentSettingsToken: params.token
    }
  });

  if (!member) {
    return redirectToTokenPage(params.token, baseUrl, {
      error: "找不到這個付款設定連結，請重新向 Bot 取得最新連結。"
    });
  }

  const formData = await request.formData();
  const acceptBankTransfer = formData.get("acceptBankTransfer") === "on";
  const acceptLinePay = formData.get("acceptLinePay") === "on";
  const acceptCash = formData.get("acceptCash") === "on";
  const bankName = cleanOptionalString(formData.get("bankName"));
  const bankAccount = cleanOptionalString(formData.get("bankAccount"));
  const linePayId = cleanOptionalString(formData.get("linePayId"));
  const paymentNote = cleanOptionalString(formData.get("paymentNote"));

  if (acceptBankTransfer && !bankAccount) {
    return redirectToTokenPage(params.token, baseUrl, {
      error: "你開啟了銀行轉帳，請至少填寫銀行帳號。"
    });
  }

  if (acceptLinePay && !linePayId) {
    return redirectToTokenPage(params.token, baseUrl, {
      error: "你開啟了 LINE Pay，請填寫 LINE Pay 資訊。"
    });
  }

  if (!acceptBankTransfer && !acceptLinePay && !acceptCash) {
    return redirectToTokenPage(params.token, baseUrl, {
      error: "至少要保留一種收款方式。"
    });
  }

  await db.memberPaymentProfile.upsert({
    where: {
      memberId: member.id
    },
    update: {
      acceptBankTransfer,
      bankName,
      bankAccount,
      acceptLinePay,
      linePayId,
      acceptCash,
      paymentNote
    },
    create: {
      memberId: member.id,
      acceptBankTransfer,
      bankName,
      bankAccount,
      acceptLinePay,
      linePayId,
      acceptCash,
      paymentNote
    }
  });

  return redirectToTokenPage(params.token, baseUrl, {
    saved: "1"
  });
}
