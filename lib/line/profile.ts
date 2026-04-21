import type { LineEvent } from "@/lib/line/types";

const LINE_API_BASE = "https://api.line.me/v2/bot";

function getAccessToken() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();

  if (!token) {
    throw new Error("Missing required environment variable: LINE_CHANNEL_ACCESS_TOKEN");
  }

  return token;
}

async function fetchLineProfile(path: string) {
  const response = await fetch(`${LINE_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${getAccessToken()}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { displayName?: string };
  return payload.displayName?.trim() || null;
}

export async function getLineDisplayName(source: LineEvent["source"]) {
  if (!source.userId) {
    return null;
  }

  if (source.type === "group" && source.groupId) {
    return fetchLineProfile(`/group/${source.groupId}/member/${source.userId}`);
  }

  if (source.type === "room" && source.roomId) {
    return fetchLineProfile(`/room/${source.roomId}/member/${source.userId}`);
  }

  return fetchLineProfile(`/profile/${source.userId}`);
}
