import { createHmac, timingSafeEqual } from "crypto";

export function verifyLineSignature(rawBody: string, signature: string | null) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (!channelSecret) {
    throw new Error("Missing required environment variable: LINE_CHANNEL_SECRET");
  }

  if (!signature) {
    return false;
  }

  const digest = createHmac("sha256", channelSecret).update(rawBody).digest("base64");

  if (digest.length !== signature.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}
