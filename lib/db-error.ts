import { Prisma } from "@prisma/client";

const SAFE_DATABASE_ERROR_MESSAGE =
  "\u5c0f\u4e8c\u66ab\u6642\u9023\u7dda\u4e0d\u7a69\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002";

function hasDatabaseMessage(value: unknown) {
  if (!(value instanceof Error)) {
    return false;
  }

  return /database|prisma|neon|postgres|postgresql|connect|connection|pooler|p1001|p1002|p1017/i.test(
    value.message
  );
}

export function isDatabaseError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientValidationError ||
    hasDatabaseMessage(error)
  );
}

export function getSafeUserErrorMessage(error: unknown) {
  if (isDatabaseError(error)) {
    return SAFE_DATABASE_ERROR_MESSAGE;
  }

  return SAFE_DATABASE_ERROR_MESSAGE;
}
