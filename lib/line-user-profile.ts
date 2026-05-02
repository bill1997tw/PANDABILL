import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

export const PAYMENT_SETUP_STEPS = {
  awaitingMethodChoice: "waiting_payment_selection",
  awaitingBankInfo: "waiting_bank_info",
  awaitingOtherMethod: "waiting_other_payment",
  awaitingNote: "waiting_remark"
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
  pendingSelections: number[];
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
    acceptCash: profile?.acceptCash ?? false,
    paymentNote: profile?.paymentNote ?? null,
    pendingSelections: profile?.pendingSelections ?? []
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
      typeof candidate.acceptCash === "boolean" ? candidate.acceptCash : false,
    paymentNote:
      typeof candidate.paymentNote === "string" ? candidate.paymentNote : null,
    pendingSelections: Array.isArray(candidate.pendingSelections)
      ? candidate.pendingSelections.filter(
          (value): value is number => typeof value === "number"
        )
      : []
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
    paymentNote: draft.paymentNote,
    pendingSelections: draft.pendingSelections
  };
}

function normalizePersistedProfile(profile: LineUserProfileRecord | null) {
  if (!profile) {
    return defaultPaymentSetupDraft();
  }

  return defaultPaymentSetupDraft({
    memberName: profile.memberName,
    acceptBankTransfer: profile.acceptBankTransfer,
    bankName: profile.bankName,
    bankAccount: profile.bankAccount,
    acceptLinePay: profile.acceptLinePay,
    acceptCash: profile.acceptCash,
    paymentNote: profile.paymentNote
  });
}

export function getCurrentPaymentDraft(profile: LineUserProfileRecord | null) {
  const draft = parsePaymentSetupDraft(profile?.setupDraft);
  const persisted = normalizePersistedProfile(profile);

  return defaultPaymentSetupDraft({
    memberName: draft.memberName ?? persisted.memberName,
    acceptBankTransfer: draft.acceptBankTransfer || persisted.acceptBankTransfer,
    bankName: draft.bankName ?? persisted.bankName,
    bankAccount: draft.bankAccount ?? persisted.bankAccount,
    acceptLinePay: draft.acceptLinePay || persisted.acceptLinePay,
    acceptCash: draft.acceptCash || persisted.acceptCash,
    paymentNote: draft.paymentNote ?? persisted.paymentNote,
    pendingSelections: draft.pendingSelections
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
