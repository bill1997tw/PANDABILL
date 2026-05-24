const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";

export type LineTextReplyPayload = string;

type LineTextMessage = {
  type: "text";
  text: string;
};

function toLineTextMessage(input: LineTextReplyPayload): LineTextMessage {
  return {
    type: "text",
    text: input
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
