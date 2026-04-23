import type { LineQuickReply } from "@/lib/line/quick-reply";

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";

export type LineTextReplyPayload =
  | string
  | {
      text: string;
      quickReply?: LineQuickReply;
    };

type LineTextMessage = {
  type: "text";
  text: string;
  quickReply?: LineQuickReply;
};

function toLineTextMessage(input: LineTextReplyPayload): LineTextMessage {
  if (typeof input === "string") {
    return {
      type: "text",
      text: input
    };
  }

  return {
    type: "text",
    text: input.text,
    quickReply: input.quickReply
  };
}

export async function replyLineText(replyToken: string, input: LineTextReplyPayload) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("Missing required environment variable: LINE_CHANNEL_ACCESS_TOKEN");
  }

  const response = await fetch(LINE_REPLY_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      replyToken,
      messages: [toLineTextMessage(input)]
    })
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`LINE reply failed: ${payload}`);
  }
}
