import { createHash, createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

type LineChatType = "group" | "room";
type SupabaseRpcError = { message?: string };

function getConfig() {
  const url = process.env.TRAVEL_SUPABASE_URL?.replace(/\/+$/u, "");
  const serviceRoleKey = process.env.TRAVEL_SUPABASE_SERVICE_ROLE_KEY;
  const hmacSecret = process.env.TRAVEL_LINE_BINDING_HMAC_SECRET;

  if (!url || !serviceRoleKey || !hmacSecret) {
    throw new Error("travel_cloud_not_configured");
  }

  return { url, serviceRoleKey, hmacSecret };
}

export function parseTravelPairingCommand(text: string) {
  const match = text.trim().match(
    /^綁定旅程\s+([0-9a-f]{4}(?:-[0-9a-f]{4}){3})$/iu
  );
  return match?.[1].toUpperCase() ?? null;
}

export function parseTravelMemberLinkCommand(text: string) {
  const match = text.trim().match(
    /^連結成員\s+([0-9a-f]{4}(?:-[0-9a-f]{4}){3})$/iu
  );
  return match?.[1].toUpperCase() ?? null;
}

export function createLineChatKey(chatId: string, secret: string) {
  return createHmac("sha256", secret).update(chatId, "utf8").digest("hex");
}

export function createLineUserKey(lineUserId: string, secret: string) {
  return createHmac("sha256", secret).update(lineUserId, "utf8").digest("hex");
}

async function callRpc<T>(
  functionName: string,
  payload: Record<string, unknown>
): Promise<T> {
  const { url, serviceRoleKey } = getConfig();
  const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as SupabaseRpcError;
    throw new Error(error.message || `travel_cloud_rpc_${response.status}`);
  }

  return response.json() as Promise<T>;
}

function stableBridgeEntryId(kind: string, localId: string) {
  const bytes = createHash("sha256")
    .update(`${kind}:${localId}`, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}

function toTwdMinorUnits(amountCents: number, allowZero = false) {
  const invalidSign = allowZero ? amountCents < 0 : amountCents <= 0;
  if (!Number.isSafeInteger(amountCents) || invalidSign || amountCents % 100 !== 0) {
    throw new Error("travel_cloud_fractional_twd_unsupported");
  }
  // Both the LINE ledger and cloud ledger use minor units (cents).
  return amountCents;
}

async function getBoundTripId(chatId: string, secret: string) {
  const binding = await callRpc<{ trip_id: string } | null>(
    "get_line_trip_binding_by_chat_key",
    { target_line_chat_key: createLineChatKey(chatId, secret) }
  );
  return binding?.trip_id ?? null;
}

export type TravelTripRoster = {
  tripId: string;
  tripTitle: string;
  members: string[];
};

export async function getTravelTripRoster(
  chatId: string
): Promise<TravelTripRoster | null> {
  const { hmacSecret } = getConfig();
  const roster = await callRpc<{
    trip_id?: unknown;
    trip_title?: unknown;
    members?: unknown;
  } | null>("get_line_trip_roster_by_chat_key", {
    target_line_chat_key: createLineChatKey(chatId, hmacSecret)
  });

  if (!roster) {
    return null;
  }

  const tripId = typeof roster.trip_id === "string" ? roster.trip_id.trim() : "";
  const tripTitle =
    typeof roster.trip_title === "string" ? roster.trip_title.trim() : "";
  const members = Array.isArray(roster.members)
    ? [
        ...new Set(
          roster.members
            .filter((member): member is string => typeof member === "string")
            .map((member) => member.trim())
            .filter(Boolean)
        )
      ]
    : [];

  if (!tripId || !tripTitle || members.length === 0) {
    throw new Error("travel_trip_roster_invalid");
  }

  return { tripId, tripTitle, members };
}

export type TravelCloudSyncResult =
  | { status: "not_bound" | "synced" }
  | { status: "warning"; message: string };

export type TravelExpenseSyncInput = {
  localEntryId: string;
  chatId: string;
  actorLineUserId: string;
  title: string;
  amountCents: number;
  occurredAt: string;
  payerName?: string;
  payerLineUserId?: string;
  shares: Array<{
    memberName?: string;
    lineUserId?: string;
    shareCents: number;
  }>;
  borrowing?: {
    borrowerName?: string;
    borrowerLineUserId?: string;
    lenderName?: string;
    lenderLineUserId?: string;
  };
};

function participantReference(
  memberName: string | undefined,
  lineUserId: string | undefined,
  hmacSecret: string
) {
  const normalizedName = memberName?.trim();
  if (normalizedName) return normalizedName;
  if (lineUserId) return createLineUserKey(lineUserId, hmacSecret);
  throw new Error("travel_cloud_participant_reference_required");
}

export async function syncTravelExpense(
  input: TravelExpenseSyncInput
): Promise<TravelCloudSyncResult> {
  try {
    const { hmacSecret } = getConfig();
    if (!(await getBoundTripId(input.chatId, hmacSecret))) {
      return { status: "not_bound" };
    }
    const common = {
      target_line_chat_key: createLineChatKey(input.chatId, hmacSecret),
      target_actor_line_user_key: createLineUserKey(input.actorLineUserId, hmacSecret),
      bridge_entry_id: stableBridgeEntryId(
        input.borrowing ? "borrowing" : "expense",
        input.localEntryId
      )
    };
    if (input.borrowing) {
      await callRpc("create_line_ledger_borrowing", {
        ...common,
        borrowing_amount_minor: toTwdMinorUnits(input.amountCents),
        borrowing_currency: "TWD",
        borrowing_borrower_line_user_key: participantReference(
          input.borrowing.borrowerName,
          input.borrowing.borrowerLineUserId,
          hmacSecret
        ),
        borrowing_lender_line_user_key: participantReference(
          input.borrowing.lenderName,
          input.borrowing.lenderLineUserId,
          hmacSecret
        ),
        borrowing_occurred_at: input.occurredAt
      });
    } else {
      await callRpc("create_line_ledger_expense", {
        ...common,
        expense_title: input.title,
        expense_amount_minor: toTwdMinorUnits(input.amountCents),
        expense_currency: "TWD",
        expense_payer_line_user_key: participantReference(
          input.payerName,
          input.payerLineUserId,
          hmacSecret
        ),
        expense_shares: input.shares.map((share) => ({
          line_user_key: participantReference(
            share.memberName,
            share.lineUserId,
            hmacSecret
          ),
          amount_minor: toTwdMinorUnits(share.shareCents, true)
        })),
        expense_occurred_at: input.occurredAt
      });
    }
    return { status: "synced" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/line_(?:payer|participant|transfer_member)_not_linked/u.test(message)) {
      return {
        status: "warning",
        message: "小二已記帳，但旅遊小本本的活動名單中找不到相關成員，所以雲端尚未同步。"
      };
    }
    return {
      status: "warning",
      message: "小二已記帳，但旅遊小本本同步暫時失敗；相同紀錄 ID 不會重複寫入。"
    };
  }
}

export type TravelRepaymentSyncInput = {
  localEntryId: string;
  chatId: string;
  actorLineUserId: string;
  payerName?: string;
  payerLineUserId?: string;
  receiverName?: string;
  receiverLineUserId?: string;
  amountCents: number;
  occurredAt: string;
};

export async function syncTravelRepayment(
  input: TravelRepaymentSyncInput
): Promise<TravelCloudSyncResult> {
  try {
    const { hmacSecret } = getConfig();
    if (!(await getBoundTripId(input.chatId, hmacSecret))) {
      return { status: "not_bound" };
    }
    await callRpc("create_line_ledger_repayment", {
      target_line_chat_key: createLineChatKey(input.chatId, hmacSecret),
      target_actor_line_user_key: createLineUserKey(input.actorLineUserId, hmacSecret),
      bridge_entry_id: stableBridgeEntryId("repayment", input.localEntryId),
      repayment_amount_minor: toTwdMinorUnits(input.amountCents),
      repayment_currency: "TWD",
      repayment_payer_line_user_key: participantReference(
        input.payerName,
        input.payerLineUserId,
        hmacSecret
      ),
      repayment_receiver_line_user_key: participantReference(
        input.receiverName,
        input.receiverLineUserId,
        hmacSecret
      ),
      repayment_occurred_at: input.occurredAt
    });
    return { status: "synced" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      status: "warning",
      message: /line_transfer_member_not_linked/u.test(message)
        ? "小二已記錄還款，但旅遊小本本的活動名單中找不到付款人或收款人。"
        : "小二已記錄還款，但旅遊小本本同步暫時失敗；相同紀錄 ID 不會重複寫入。"
    };
  }
}

function retryAt(attempts: number) {
  const delayMinutes = Math.min(60, 2 ** Math.min(attempts, 6));
  return new Date(Date.now() + delayMinutes * 60_000);
}

async function rememberFailedSync(
  entryType: "expense" | "repayment",
  localEntryId: string,
  payload: TravelExpenseSyncInput | TravelRepaymentSyncInput,
  message: string
) {
  await db.travelCloudSyncJob.upsert({
    where: {
      entryType_localEntryId: { entryType, localEntryId }
    },
    create: {
      entryType,
      localEntryId,
      payload: payload as unknown as Prisma.InputJsonValue,
      lastError: message,
      nextAttemptAt: retryAt(0)
    },
    update: {
      payload: payload as unknown as Prisma.InputJsonValue,
      status: "pending",
      lastError: message,
      nextAttemptAt: retryAt(0)
    }
  });
}

export async function syncTravelExpenseReliably(
  input: TravelExpenseSyncInput
): Promise<TravelCloudSyncResult> {
  const result = await syncTravelExpense(input);
  if (result.status === "warning") {
    try {
      await rememberFailedSync("expense", input.localEntryId, input, result.message);
    } catch (error) {
      console.error("Failed to queue travel expense sync", error);
    }
  } else {
    await db.travelCloudSyncJob.deleteMany({
      where: { entryType: "expense", localEntryId: input.localEntryId }
    });
  }
  return result;
}

export async function syncTravelRepaymentReliably(
  input: TravelRepaymentSyncInput
): Promise<TravelCloudSyncResult> {
  const result = await syncTravelRepayment(input);
  if (result.status === "warning") {
    try {
      await rememberFailedSync("repayment", input.localEntryId, input, result.message);
    } catch (error) {
      console.error("Failed to queue travel repayment sync", error);
    }
  } else {
    await db.travelCloudSyncJob.deleteMany({
      where: { entryType: "repayment", localEntryId: input.localEntryId }
    });
  }
  return result;
}

export async function retryTravelCloudSyncJobs(limit = 3) {
  const jobs = await db.travelCloudSyncJob.findMany({
    where: {
      status: "pending",
      nextAttemptAt: { lte: new Date() }
    },
    orderBy: { createdAt: "asc" },
    take: limit
  });

  for (const job of jobs) {
    const result =
      job.entryType === "expense"
        ? await syncTravelExpense(job.payload as unknown as TravelExpenseSyncInput)
        : await syncTravelRepayment(job.payload as unknown as TravelRepaymentSyncInput);

    if (result.status !== "warning") {
      await db.travelCloudSyncJob.deleteMany({ where: { id: job.id } });
      continue;
    }

    const attempts = job.attempts + 1;
    await db.travelCloudSyncJob.update({
      where: { id: job.id },
      data: {
        attempts,
        lastError: result.message,
        nextAttemptAt: retryAt(attempts)
      }
    });
  }
}

export async function redeemTravelPairing(input: {
  pairingCode: string;
  chatId: string;
  chatType: LineChatType;
}) {
  const { hmacSecret } = getConfig();
  return callRpc("redeem_line_trip_binding_claim", {
    pairing_code: input.pairingCode,
    target_line_chat_key: createLineChatKey(input.chatId, hmacSecret),
    target_chat_type: input.chatType
  });
}

export async function redeemTravelMemberLink(input: {
  pairingCode: string;
  chatId: string;
  lineUserId: string;
}) {
  const { hmacSecret } = getConfig();
  return callRpc("redeem_line_trip_member_claim", {
    pairing_code: input.pairingCode,
    target_line_chat_key: createLineChatKey(input.chatId, hmacSecret),
    target_line_user_key: createLineUserKey(input.lineUserId, hmacSecret)
  });
}

export function getTravelPairingErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "travel_cloud_not_configured") {
    return "旅遊小本本連動尚未完成伺服器設定，請稍後再試。";
  }
  if (message === "pairing_code_unavailable") {
    return "這組配對碼已過期、已使用或已取消，請回旅遊小本本重新產生。";
  }
  if (message === "invalid_pairing_code") {
    return "配對碼格式不正確，請直接複製旅遊小本本顯示的完整指令。";
  }
  if (message === "line_member_claim_unavailable") {
    return "這組成員身分碼已過期、已使用或已取消，請回旅遊小本本重新產生。";
  }
  if (message === "wrong_line_group_for_trip") {
    return "這組成員身分碼必須貼在該旅程已綁定的小二 LINE 群組中。";
  }
  if (message.includes("duplicate key")) {
    return "這個 LINE 群組或旅程已經綁定；請先在旅遊小本本解除舊綁定。";
  }
  return "LINE 與旅遊小本本暫時無法完成綁定，請稍後再試。";
}
