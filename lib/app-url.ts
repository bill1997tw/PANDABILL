import { getOptionalEnv } from "@/lib/env";

function normalizeUrl(value: string) {
  return value.replace(/\/$/, "");
}

export function resolveAppBaseUrl(request?: Request) {
  const explicit = getOptionalEnv("APP_BASE_URL");

  if (explicit) {
    return normalizeUrl(explicit);
  }

  const vercelProductionUrl = getOptionalEnv("VERCEL_PROJECT_PRODUCTION_URL");

  if (vercelProductionUrl) {
    return normalizeUrl(`https://${vercelProductionUrl.replace(/^https?:\/\//, "")}`);
  }

  const vercelUrl = getOptionalEnv("VERCEL_URL");

  if (vercelUrl) {
    return normalizeUrl(`https://${vercelUrl.replace(/^https?:\/\//, "")}`);
  }

  if (request) {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const forwardedHost = request.headers.get("x-forwarded-host");

    if (forwardedProto && forwardedHost) {
      return normalizeUrl(`${forwardedProto}://${forwardedHost}`);
    }

    return normalizeUrl(new URL(request.url).origin);
  }

  return null;
}
