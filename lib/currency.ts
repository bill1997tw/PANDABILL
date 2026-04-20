const DECIMAL_REGEX = /^\d+(\.\d{1,2})?$/;

export function parseAmountToCents(input: string | number): number {
  const raw = String(input).trim();

  if (!DECIMAL_REGEX.test(raw)) {
    throw new Error("金額格式不正確，請輸入最多兩位小數的正數。");
  }

  const [whole, fraction = ""] = raw.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));

  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error("金額必須大於 0。");
  }

  return cents;
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("zh-TW", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
