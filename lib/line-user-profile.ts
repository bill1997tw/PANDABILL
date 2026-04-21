import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

export const PAYMENT_SETUP_STEPS = {
  awaitingName: "awaiting_name",
  awaitingBankChoice: "awaiting_bank_choice",
  awaitingBankName: "awaiting_bank_name",
  awaitingBankAccount: "awaiting_bank_account",
  awaitingLinePayChoice: "awaiting_linepay_choice",
  awaitingCashChoice: "awaiting_cash_choice",
  awaitingNote: "awaiting_note"
} as const;

export type PaymentSetupStep =
  (typeof PAYMENT_SETUP_STEPS)[keyof typeof PAYMENT_SETUP_STEPS];

export type PaymentSetupDraft = {
  memberName: string | null;
  acceptBankTransfer: boolean;
  bankName: string | null;
  bankAccount: string | null;
  acceptLinePay: boolean;
  acceptCash: boolean;
  paymentNote: string | null;
};

type LineUserProfileRecord = {
  memberName: string | null;
  acceptBankTransfer: boolean;
  bankName: string | null;
  bankAccount: string | null;
  acceptLinePay: boolean;
  acceptCash: boolean;
  paymentNote: string | null;
  setupState: string | null;
  setupDraft: Prisma.JsonValue | null;
};

export function defaultPaymentSetupDraft(
  profile?: Partial<PaymentSetupDraft> | null
): PaymentSetupDraft {
  return {
    memberName: profile?.memberName ?? null,
    acceptBankTransfer: profile?.acceptBankTransfer ?? false,
    bankName: profile?.bankName ?? null,
    bankAccount: profile?.bankAccount ?? null,
    acceptLinePay: profile?.acceptLinePay ?? false,
    acceptCash: profile?.acceptCash ?? true,
    paymentNote: profile?.paymentNote ?? null
  };
}

export function parsePaymentSetupDraft(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultPaymentSetupDraft();
  }

  const candidate = value as Record<string, unknown>;

  return defaultPaymentSetupDraft({
    memberName:
      typeof candidate.memberName === "string" ? candidate.memberName : null,
    acceptBankTransfer:
      typeof candidate.acceptBankTransfer === "boolean"
        ? candidate.acceptBankTransfer
        : false,
    bankName: typeof candidate.bankName === "string" ? candidate.bankName : null,
    bankAccount:
      typeof candidate.bankAccount === "string" ? candidate.bankAccount : null,
    acceptLinePay:
      typeof candidate.acceptLinePay === "boolean" ? candidate.acceptLinePay : false,
    acceptCash:
      typeof candidate.acceptCash === "boolean" ? candidate.acceptCash : true,
    paymentNote:
      typeof candidate.paymentNote === "string" ? candidate.paymentNote : null
  });
}

export function serializePaymentSetupDraft(
  draft: PaymentSetupDraft
): Prisma.InputJsonValue {
  return {
    memberName: draft.memberName,
    acceptBankTransfer: draft.acceptBankTransfer,
    bankName: draft.bankName,
    bankAccount: draft.bankAccount,
    acceptLinePay: draft.acceptLinePay,
    acceptCash: draft.acceptCash,
    paymentNote: draft.paymentNote
  };
}

export function getCurrentPaymentDraft(profile: LineUserProfileRecord | null) {
  const draft = parsePaymentSetupDraft(profile?.setupDraft);

  if (!profile) {
    return draft;
  }

  return defaultPaymentSetupDraft({
    memberName: draft.memberName ?? profile.memberName,
    acceptBankTransfer: draft.acceptBankTransfer ?? profile.acceptBankTransfer,
    bankName: draft.bankName ?? profile.bankName,
    bankAccount: draft.bankAccount ?? profile.bankAccount,
    acceptLinePay: draft.acceptLinePay ?? profile.acceptLinePay,
    acceptCash: draft.acceptCash ?? profile.acceptCash,
    paymentNote: draft.paymentNote ?? profile.paymentNote
  });
}

export async function getOrCreateLineUserProfile(lineUserId: string) {
  return db.lineUserProfile.upsert({
    where: { lineUserId },
    update: {},
    create: { lineUserId }
  });
}

export async function updateLineUserProfileDraft(
  lineUserId: string,
  setupState: PaymentSetupStep | null,
  draft: PaymentSetupDraft | null
) {
  return db.lineUserProfile.upsert({
    where: { lineUserId },
    update: {
      setupState,
      setupDraft: draft ? serializePaymentSetupDraft(draft) : Prisma.JsonNull
    },
    create: {
      lineUserId,
      setupState,
      setupDraft: draft ? serializePaymentSetupDraft(draft) : Prisma.JsonNull
    }
  });
}
