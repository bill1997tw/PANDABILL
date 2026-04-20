function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

export function getOptionalEnv(name: string) {
  return readEnv(name);
}

export function getRequiredEnv(name: string) {
  const value = readEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getProductionEnvChecklist() {
  const hasAppBaseUrl =
    Boolean(readEnv("APP_BASE_URL")) ||
    Boolean(readEnv("VERCEL_PROJECT_PRODUCTION_URL")) ||
    Boolean(readEnv("VERCEL_URL"));

  return {
    databaseUrl: Boolean(readEnv("DATABASE_URL")),
    directDatabaseUrl: Boolean(readEnv("DIRECT_DATABASE_URL")),
    appBaseUrl: hasAppBaseUrl,
    lineChannelSecret: Boolean(readEnv("LINE_CHANNEL_SECRET")),
    lineChannelAccessToken: Boolean(readEnv("LINE_CHANNEL_ACCESS_TOKEN"))
  };
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}
