import { createHmac } from "node:crypto";

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

export function createLineChatKey(chatId: string, secret: string) {
  return createHmac("sha256", secret).update(chatId, "utf8").digest("hex");
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
  if (message.includes("duplicate key")) {
    return "這個 LINE 群組或旅程已經綁定；請先在旅遊小本本解除舊綁定。";
  }
  return "LINE 與旅遊小本本暫時無法完成綁定，請稍後再試。";
}
