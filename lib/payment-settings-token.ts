import { db } from "@/lib/db";

function generatePaymentSettingsToken() {
  return `${crypto.randomUUID().replace(/-/g, "")}${Date.now().toString(36)}`;
}

export async function ensureMemberPaymentSettingsToken(memberId: string) {
  const existing = await db.member.findUnique({
    where: {
      id: memberId
    },
    select: {
      paymentSettingsToken: true
    }
  });

  if (!existing) {
    throw new Error("找不到這位成員。");
  }

  if (existing.paymentSettingsToken) {
    return existing.paymentSettingsToken;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generatePaymentSettingsToken();

    try {
      const updated = await db.member.update({
        where: {
          id: memberId
        },
        data: {
          paymentSettingsToken: token
        },
        select: {
          paymentSettingsToken: true
        }
      });

      if (!updated.paymentSettingsToken) {
        break;
      }

      return updated.paymentSettingsToken;
    } catch {
      continue;
    }
  }

  throw new Error("建立付款設定連結時失敗，請稍後再試。");
}
