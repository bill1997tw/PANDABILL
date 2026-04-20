import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { serializePaymentProfile } from "@/lib/serialize";

type Props = {
  params: {
    id: string;
  };
};

function cleanOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: Request, { params }: Props) {
  try {
    const body = await request.json();
    const acceptBankTransfer = Boolean(body.acceptBankTransfer);
    const acceptLinePay = Boolean(body.acceptLinePay);
    const acceptCash = Boolean(body.acceptCash);
    const bankName = cleanOptionalString(body.bankName);
    const bankAccount = cleanOptionalString(body.bankAccount);
    const linePayId = cleanOptionalString(body.linePayId);
    const paymentNote = cleanOptionalString(body.paymentNote);

    const member = await db.member.findUnique({
      where: {
        id: params.id
      }
    });

    if (!member) {
      return fail("找不到這位成員。", 404);
    }

    if (acceptBankTransfer && !bankAccount) {
      return fail("啟用銀行轉帳時，請填寫銀行帳號。");
    }

    if (acceptLinePay && !linePayId) {
      return fail("啟用 LINE Pay 時，請填寫 LINE Pay 資訊。");
    }

    const profile = await db.memberPaymentProfile.upsert({
      where: {
        memberId: params.id
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
        memberId: params.id,
        acceptBankTransfer,
        bankName,
        bankAccount,
        acceptLinePay,
        linePayId,
        acceptCash,
        paymentNote
      }
    });

    return ok({
      paymentProfile: serializePaymentProfile(profile)
    });
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "更新收款設定失敗。"
    );
  }
}
