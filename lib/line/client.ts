const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";

type LineTextMessage = {
  type: "text";
  text: string;
};

export async function replyLineText(replyToken: string, text: string) {
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
      messages: [{ type: "text", text } satisfies LineTextMessage]
    })
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`LINE reply failed: ${payload}`);
  }
}
