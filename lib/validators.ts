export function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName}不能是空白。`);
  }

  return value.trim();
}

export function assertStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${fieldName}至少要有一筆資料。`);
  }

  const cleanValues = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  if (cleanValues.length === 0) {
    throw new Error(`${fieldName}至少要有一筆有效資料。`);
  }

  return Array.from(new Set(cleanValues));
}
