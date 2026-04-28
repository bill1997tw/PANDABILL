import { PendingActionType, Prisma } from "@prisma/client";

import {
  getCollectingMembersPrompt,
  getConfirmedMembersPrompt,
  getLedgerListText,
  getNoActiveLedgerText
} from "@/lib/commands/activity";
import {
  getExpenseGuideText,
  getPaymentSetupGuideText,
  getSettlementMenuText,
  getXiaoerMenuText
} from "@/lib/commands/help";
import {
  getActiveMenuContext,
  getMenuContextExpiredPrompt,
  rememberMenuContext,
  resolveMenuModeFromContext
} from "@/lib/commands/menu-context";
import { formatPaymentSummary } from "@/lib/commands/payment";
import {
  clearPendingAction,
  createPendingAction,
  getPendingAction,
  getPendingActionState
} from "@/lib/commands/pending";
import { getCollectingMemberUpdateText } from "@/lib/commands/participant-roster";
import { getMvpText, getSettlementSummaryText } from "@/lib/commands/settlement";
import { formatCents } from "@/lib/currency";
import { db } from "@/lib/db";
import {
  calculateSettlement,
  createExpenseInGroup,
  formatExpenseLine,
  getActiveLedgerExpenseMvp,
  getArchivedLedgerSnapshots,
  getConfirmedMemberIdsForActiveLedger,
  getGroupInfoSummary,
  getMembersMissingPaymentMethod,
  getOrCreateGroupContext,
  getRecentExpenses,
  getSettlementSnapshot
} from "@/lib/group-service";
import {
  archiveActiveLedger,
  archiveLedger,
  closeActiveLedger,
  confirmCollectingLedger,
  createLedgerForGroup,
  getActiveLedger,
  getActiveLedgerParticipants,
  joinCollectingLedger,
  listLedgers,
  switchActiveLedger,
  leaveCollectingLedger
} from "@/lib/ledger-service";
import {
  defaultPaymentSetupDraft,
  getCurrentPaymentDraft,
  getOrCreateLineUserProfile,
  PAYMENT_SETUP_STEPS,
  type PaymentSetupDraft,
  type PaymentSetupStep,
  updateLineUserProfileDraft
} from "@/lib/line-user-profile";
import { parseLineCommand } from "@/lib/line/parser";
import { getLineDisplayName } from "@/lib/line/profile";
import {
  buildActivityConfirmedQuickReply,
  buildActivityCreatedQuickReply,
  buildArchivedLedgerQuickReply,
  buildAssistantQuickReply,
  buildExpenseQuickReply,
  buildSettlementQuickReply,
  buildSettlementResultQuickReply,
  type LineQuickReply
} from "@/lib/line/quick-reply";
import type { LineTextReplyPayload } from "@/lib/line/client";
import type { LineEvent, LineMessageEvent, ParsedLineCommand } from "@/lib/line/types";

const AWAITING_ACTIVITY_NAME_ACTION = PendingActionType.awaiting_activity_name;

type GroupContext = NonNullable<Awaited<ReturnType<typeof getOrCreateGroupContext>>>;

function getChatContext(source: LineEvent["source"]) {
  if (source.type === "group") {
    return {
      chatId: source.groupId ?? "",
      chatType: "group" as const,
      lineUserId: source.userId
    };
  }

  if (source.type === "room") {
    return {
      chatId: source.roomId ?? "",
      chatType: "room" as const,
      lineUserId: source.userId
    };
  }

  return {
    chatId: source.userId ?? "",
    chatType: "user" as const,
    lineUserId: source.userId
  };
}

function getGroupOnlyMessage() {
  return "這個功能要在群組裡使用。";
}

function getMissingLineIdentityMessage() {
  return "目前抓不到你的 LINE 身分，請稍後再試。";
}

function getGroupContextUnavailableMessage() {
  return "目前暫時找不到這個群組資料，請稍後再試。";
}

function getWelcomeJoinMessage() {
  return [
    "我已加入這個群組，可直接建立活動與記帳。",
    "例如輸入：",
    "建立活動 宜蘭三天兩夜",
    "或",
    "晚餐 600 我付 4人"
  ].join("\n");
}

function getAwaitingActivityNamePrompt() {
  return "請輸入這次活動名稱，例如：宜蘭三天兩夜";
}

function getAwaitingActivityNameExpiredPrompt() {
  return "建立活動已逾時，請重新輸入「建立活動」";
}

function withQuickReply(text: string, quickReply?: LineQuickReply): LineTextReplyPayload {
  if (!quickReply) {
    return text;
  }

  return {
    text,
    quickReply
  };
}

function parseBooleanChoice(text: string) {
  const normalized = text.trim();

  if (["是", "可以", "收", "y", "Y", "yes", "YES"].includes(normalized)) {
    return true;
  }

  if (["否", "不可以", "不收", "n", "N", "no", "NO"].includes(normalized)) {
    return false;
  }

  return null;
}

function isSkipText(text: string) {
  return ["略過", "不用", "無", "skip"].includes(text.trim());
}

function formatSpeechAmount(cents: number) {
  if (cents % 100 === 0) {
    return new Intl.NumberFormat("zh-TW").format(cents / 100);
  }

  return formatCents(cents);
}

async function resolveActorDisplayName(
  event: LineMessageEvent,
  groupContext?: GroupContext | null
) {
  const displayName = await getLineDisplayName(event.source);

  if (displayName) {
    return displayName;
  }

  const lineUserId = event.source.userId;

  if (lineUserId) {
    const profile = await db.lineUserProfile.findUnique({
      where: { lineUserId }
    });

    if (profile?.memberName) {
      return profile.memberName;
    }

    const matchedMember = groupContext?.group.members.find(
      (member) => member.lineUserId === lineUserId
    );

    if (matchedMember) {
      return matchedMember.name;
    }

    return `使用者${lineUserId.slice(-4)}`;
  }

  return "使用者";
}

async function requireGroupContext(event: LineMessageEvent) {
  const { chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return {
      ok: false as const,
      message: getGroupOnlyMessage()
    };
  }

  const context = await getOrCreateGroupContext(event.source);

  if (!context) {
    return {
      ok: false as const,
      message: getGroupContextUnavailableMessage()
    };
  }

  return {
    ok: true as const,
    context
  };
}

async function startAwaitingActivityName(input: {
  groupId: string;
  chatId: string;
  lineUserId?: string;
}) {
  if (!input.lineUserId) {
    return getMissingLineIdentityMessage();
  }

  await createPendingAction({
    groupId: input.groupId,
    chatId: input.chatId,
    requesterLineUserId: input.lineUserId,
    actionType: AWAITING_ACTIVITY_NAME_ACTION,
    ttlMinutes: 3
  });

  return getAwaitingActivityNamePrompt();
}

async function startPaymentSetup(lineUserId: string, presetName?: string) {
  const profile = await getOrCreateLineUserProfile(lineUserId);
  const draft = defaultPaymentSetupDraft({
    memberName: presetName ?? profile.memberName,
    acceptBankTransfer: profile.acceptBankTransfer,
    bankName: profile.bankName,
    bankAccount: profile.bankAccount,
    acceptLinePay: profile.acceptLinePay,
    acceptCash: profile.acceptCash,
    paymentNote: profile.paymentNote
  });

  if (!draft.memberName) {
    await updateLineUserProfileDraft(
      lineUserId,
      PAYMENT_SETUP_STEPS.awaitingName,
      draft
    );

    return ["先告訴小二你是誰。", "請輸入：我是你的名字"].join("\n");
  }

  await updateLineUserProfileDraft(
    lineUserId,
    PAYMENT_SETUP_STEPS.awaitingBankChoice,
    draft
  );

  return ["先設定銀行匯款。", "你要收銀行轉帳嗎？請回：是 / 否"].join("\n");
}

async function finishPaymentSetup(lineUserId: string, draft: PaymentSetupDraft) {
  await db.lineUserProfile.upsert({
    where: {
      lineUserId
    },
    update: {
      memberName: draft.memberName,
      acceptBankTransfer: draft.acceptBankTransfer,
      bankName: draft.bankName,
      bankAccount: draft.bankAccount,
      acceptLinePay: draft.acceptLinePay,
      acceptCash: draft.acceptCash,
      paymentNote: draft.paymentNote,
      setupState: null,
      setupDraft: Prisma.JsonNull
    },
    create: {
      lineUserId,
      memberName: draft.memberName,
      acceptBankTransfer: draft.acceptBankTransfer,
      bankName: draft.bankName,
      bankAccount: draft.bankAccount,
      acceptLinePay: draft.acceptLinePay,
      acceptCash: draft.acceptCash,
      paymentNote: draft.paymentNote,
      setupState: null,
      setupDraft: Prisma.JsonNull
    }
  });

  return formatPaymentSummary({
    memberName: draft.memberName ?? "使用者",
    acceptBankTransfer: draft.acceptBankTransfer,
    bankName: draft.bankName,
    bankAccount: draft.bankAccount,
    acceptLinePay: draft.acceptLinePay,
    acceptCash: draft.acceptCash,
    paymentNote: draft.paymentNote
  });
}

async function handlePaymentSetupResponse(lineUserId: string, text: string) {
  const profile = await getOrCreateLineUserProfile(lineUserId);
  const setupState = profile.setupState as PaymentSetupStep | null;

  if (!setupState) {
    return null;
  }

  const message = text.trim();
  const draft = getCurrentPaymentDraft(profile);

  switch (setupState) {
    case PAYMENT_SETUP_STEPS.awaitingName: {
      if (!message.startsWith("我是")) {
        return "請輸入：我是你的名字";
      }

      draft.memberName = message.replace(/^我是/u, "").trim();
      await updateLineUserProfileDraft(
        lineUserId,
        PAYMENT_SETUP_STEPS.awaitingBankChoice,
        draft
      );

      return "你要收銀行轉帳嗎？請回：是 / 否";
    }

    case PAYMENT_SETUP_STEPS.awaitingBankChoice: {
      const choice = parseBooleanChoice(message);
      if (choice === null) {
        return "請回：是 / 否";
      }

      draft.acceptBankTransfer = choice;

      if (choice) {
        await updateLineUserProfileDraft(
          lineUserId,
          PAYMENT_SETUP_STEPS.awaitingBankName,
          draft
        );

        return "請輸入銀行名稱，例如：玉山銀行 808";
      }

      draft.bankName = null;
      draft.bankAccount = null;
      await updateLineUserProfileDraft(
        lineUserId,
        PAYMENT_SETUP_STEPS.awaitingLinePayChoice,
        draft
      );

      return "你要收 LINE Pay 嗎？請回：是 / 否";
    }

    case PAYMENT_SETUP_STEPS.awaitingBankName: {
      if (!message) {
        return "請輸入銀行名稱，例如：玉山銀行 808";
      }

      draft.bankName = message;
      await updateLineUserProfileDraft(
        lineUserId,
        PAYMENT_SETUP_STEPS.awaitingBankAccount,
        draft
      );

      return "請輸入銀行帳號";
    }

    case PAYMENT_SETUP_STEPS.awaitingBankAccount: {
      if (!message) {
        return "請輸入銀行帳號";
      }

      draft.bankAccount = message;
      await updateLineUserProfileDraft(
        lineUserId,
        PAYMENT_SETUP_STEPS.awaitingLinePayChoice,
        draft
      );

      return "你要收 LINE Pay 嗎？請回：是 / 否";
    }

    case PAYMENT_SETUP_STEPS.awaitingLinePayChoice: {
      const choice = parseBooleanChoice(message);
      if (choice === null) {
        return "請回：是 / 否";
      }

      draft.acceptLinePay = choice;
      await updateLineUserProfileDraft(
        lineUserId,
        PAYMENT_SETUP_STEPS.awaitingCashChoice,
        draft
      );

      return "你要收現金嗎？請回：是 / 否";
    }

    case PAYMENT_SETUP_STEPS.awaitingCashChoice: {
      const choice = parseBooleanChoice(message);
      if (choice === null) {
        return "請回：是 / 否";
      }

      draft.acceptCash = choice;
      await updateLineUserProfileDraft(
        lineUserId,
        PAYMENT_SETUP_STEPS.awaitingNote,
        draft
      );

      return "有沒有付款備註？沒有的話請回：略過";
    }

    case PAYMENT_SETUP_STEPS.awaitingNote: {
      draft.paymentNote = isSkipText(message) ? null : message;
      return finishPaymentSetup(lineUserId, draft);
    }

    default:
      return null;
  }
}

async function resolveShortcutCommand(
  event: LineMessageEvent,
  number: number,
  payload?: string
): Promise<ParsedLineCommand> {
  const { chatId, chatType, lineUserId } = getChatContext(event.source);
  const context = await getActiveMenuContext(chatId, lineUserId);
  const menuMode = resolveMenuModeFromContext(context);
  const trimmedPayload = payload?.trim();

  if (!menuMode) {
    if (chatType === "user" && number === 3) {
      return { kind: "start-payment-setup" };
    }

    return { kind: "menu-context-required" };
  }

  if (menuMode === "xiaoer") {
    if (number === 1) {
      return trimmedPayload
        ? { kind: "create-ledger", name: trimmedPayload }
        : { kind: "create-ledger-help" };
    }

    if (number === 2) {
      return { kind: "confirm-members" };
    }

    if (number === 3) {
      return { kind: "start-payment-setup" };
    }

    if (number === 4) {
      return { kind: "expense-help" };
    }

    if (number === 5) {
      return { kind: "recent-expenses" };
    }

    if (number === 6) {
      return { kind: "delete-last-expense" };
    }
  }

  if (menuMode === "settlement") {
    if (number === 1) {
      return { kind: "settlement" };
    }

    if (number === 2) {
      return { kind: "mvp" };
    }

    if (number === 3) {
      return { kind: "close-ledger" };
    }

    if (number === 4) {
      return { kind: "list-archived-ledgers" };
    }
  }

  return { kind: "ignored" };
}

async function handleCreateLedgerCommand(event: LineMessageEvent, name: string) {
  const required = await requireGroupContext(event);
  if (!required.ok) {
    return required.message;
  }

  const { chatId, lineUserId } = getChatContext(event.source);

  if (lineUserId) {
    await clearPendingAction({
      chatId,
      requesterLineUserId: lineUserId,
      actionType: AWAITING_ACTIVITY_NAME_ACTION
    });
  }

  const displayName = await resolveActorDisplayName(event, required.context);
  const result = await createLedgerForGroup(required.context.group.id, name, {
    lineUserId,
    displayName
  });

  await rememberMenuContext({
    chatId,
    lineUserId,
    groupId: required.context.group.id,
    mode: "xiaoer"
  });

  const activeParticipants = await getActiveLedgerParticipants(required.context.group.id);
  const memberNames = activeParticipants.participants.map(
    (participant) => participant.displayName
  );

  if (result.previousActiveName) {
    return withQuickReply(
      [
        `已建立活動：${result.ledger.name}，並設為目前帳本`,
        `上一個活動 ${result.previousActiveName} 已自動結束`,
        getCollectingMembersPrompt(result.ledger.name, memberNames)
      ].join("\n\n"),
      buildActivityCreatedQuickReply()
    );
  }

  return withQuickReply(
    getCollectingMembersPrompt(result.ledger.name, memberNames),
    buildActivityCreatedQuickReply()
  );
}

async function handleCreateLedgerFromPending(event: LineMessageEvent, name: string) {
  const { chatId, lineUserId } = getChatContext(event.source);

  if (!lineUserId) {
    return getMissingLineIdentityMessage();
  }

  const pendingState = await getPendingActionState({
    chatId,
    requesterLineUserId: lineUserId,
    actionType: AWAITING_ACTIVITY_NAME_ACTION
  });

  if (pendingState.expired) {
    return getAwaitingActivityNameExpiredPrompt();
  }

  if (!pendingState.pending) {
    return getAwaitingActivityNameExpiredPrompt();
  }

  await clearPendingAction({
    chatId,
    requesterLineUserId: lineUserId,
    actionType: AWAITING_ACTIVITY_NAME_ACTION
  });

  return handleCreateLedgerCommand(event, name);
}

async function handleJoinOrLeaveWithRoster(
  event: LineMessageEvent,
  action: "join" | "leave"
) {
  const required = await requireGroupContext(event);
  if (!required.ok) {
    return required.message;
  }

  const { lineUserId } = getChatContext(event.source);
  const displayName = await resolveActorDisplayName(event, required.context);
  const result =
    action === "join"
      ? await joinCollectingLedger({
          groupId: required.context.group.id,
          lineUserId,
          displayName
        })
      : await leaveCollectingLedger({
          groupId: required.context.group.id,
          lineUserId,
          displayName
        });

  if (result.status === "no-ledger") {
    return getNoActiveLedgerText();
  }

  if (result.status === "not-collecting") {
    return "這個活動的成員已經確認完成，現在可以直接記帳。";
  }

  if (result.status === "already-joined") {
    return getCollectingMemberUpdateText({
      type: "already-joined",
      actorName: displayName,
      memberNames: result.participants.map((participant) => participant.displayName)
    });
  }

  if (result.status === "not-joined") {
    return getCollectingMemberUpdateText({
      type: "not-joined",
      actorName: displayName,
      memberNames: result.participants.map((participant) => participant.displayName)
    });
  }

  return getCollectingMemberUpdateText({
    type: action === "join" ? "joined" : "left",
    actorName: displayName,
    memberNames: result.participants.map((participant) => participant.displayName)
  });
}

async function handleConfirmMembers(event: LineMessageEvent) {
  const required = await requireGroupContext(event);
  if (!required.ok) {
    return required.message;
  }

  const { lineUserId } = getChatContext(event.source);
  const activeLedger = await getActiveLedger(required.context.group.id);

  if (!activeLedger) {
    return getNoActiveLedgerText();
  }

  if (
    activeLedger.creatorLineUserId &&
    lineUserId &&
    activeLedger.creatorLineUserId !== lineUserId
  ) {
    return "只有本次活動建立者可以確認成員";
  }

  const result = await confirmCollectingLedger(required.context.group.id);

  if (result.status === "no-ledger") {
    return getNoActiveLedgerText();
  }

  if (result.status === "no-participants") {
    return "目前還沒有人報名，請先讓大家輸入 +1。";
  }

  if (result.status === "already-confirmed") {
    return "這個活動的成員已經確認完成，現在可以直接記帳。";
  }

  const missingPaymentNames = await getMembersMissingPaymentMethod(result.ledger.id);

  return withQuickReply(
    getConfirmedMembersPrompt({
      activityName: result.ledger.name,
      memberNames: result.participants.map((participant) => participant.displayName),
      missingPaymentNames
    }),
    buildActivityConfirmedQuickReply()
  );
}

async function handleListMembers(event: LineMessageEvent) {
  const required = await requireGroupContext(event);
  if (!required.ok) {
    return required.message;
  }

  const active = await getActiveLedgerParticipants(required.context.group.id);

  if (!active.ledger) {
    return getNoActiveLedgerText();
  }

  if (active.participants.length === 0) {
    return `目前活動：${active.ledger.name}\n目前尚未有報名成員`;
  }

  return [
    `目前活動：${active.ledger.name}`,
    `目前成員：${active.participants.map((participant) => participant.displayName).join("、")}`
  ].join("\n");
}

async function resolvePayerMember(input: {
  group: GroupContext["group"];
  lineUserId?: string;
  displayName: string;
  payerName?: string;
  payerIsSender?: boolean;
}) {
  if (input.payerIsSender) {
    if (input.lineUserId) {
      const byLineUserId = input.group.members.find(
        (member) => member.lineUserId === input.lineUserId
      );

      if (byLineUserId) {
        return byLineUserId;
      }
    }

    return input.group.members.find((member) => member.name === input.displayName) ?? null;
  }

  if (input.payerName) {
    return input.group.members.find((member) => member.name === input.payerName) ?? null;
  }

  return null;
}

async function handleExpenseCommand(
  event: LineMessageEvent,
  command: Extract<ParsedLineCommand, { kind: "expense" }>
) {
  const required = await requireGroupContext(event);
  if (!required.ok) {
    return required.message;
  }

  const { lineUserId } = getChatContext(event.source);
  const actorDisplayName = await resolveActorDisplayName(event, required.context);
  const confirmed = await getConfirmedMemberIdsForActiveLedger(required.context.group.id);

  if (!confirmed.ledger) {
    return getNoActiveLedgerText();
  }

  if (confirmed.ledger.isCollectingMembers) {
    return "成員還沒確認完成，請先確認成員再記帳。";
  }

  if (confirmed.memberIds.length === 0) {
    return "目前活動沒有已確認的成員，請先確認成員再記帳。";
  }

  const payer = await resolvePayerMember({
    group: required.context.group,
    lineUserId,
    displayName: actorDisplayName,
    payerName: command.payerName,
    payerIsSender: command.payerIsSender ?? !command.payerName
  });

  if (!payer) {
    return "找不到付款人，請用比較清楚的寫法，例如：晚餐 2000 阿豪付。";
  }

  const participantIds = confirmed.memberIds;

  if (command.participantCount && command.participantCount !== confirmed.memberIds.length) {
    return `你寫了 ${command.participantCount} 人分，但目前已確認成員有 ${confirmed.memberIds.length} 位，請補充更明確的分攤對象。`;
  }

  const result = await createExpenseInGroup({
    groupId: required.context.group.id,
    title: command.title,
    amount: command.amount,
    payerId: payer.id,
    participantIds,
    notes: "由 LINE Bot 建立"
  });

  const settlement = await calculateSettlement(result.ledger.id);
  const settlementLines =
    settlement?.lines.length && settlement.lines[0] !== "目前已經結清，不用再轉帳。"
      ? settlement.lines
      : ["目前已經結清，不用再轉帳。"];

  return [
    `已新增支出：${result.expense.title}`,
    `金額：NT$ ${result.expense.amountDisplay}`,
    `付款人：${result.expense.payer.name}`,
    `分攤人數：${result.expense.participants.length} 人`,
    `每人：NT$ ${formatCents(
      result.expense.participants[0]?.shareCents ?? result.expense.amountCents
    )}`,
    "",
    `目前活動：${result.ledger.name}`,
    ...settlementLines
  ].join("\n");
}

async function handleRecentExpenses(event: LineMessageEvent) {
  const required = await requireGroupContext(event);
  if (!required.ok) {
    return required.message;
  }

  const result = await getRecentExpenses(required.context.group.id, 5);

  if (!result.activeLedger) {
    return getNoActiveLedgerText();
  }

  if (result.expenses.length === 0) {
    return withQuickReply(
      [`目前活動：${result.activeLedger.name}`, "目前還沒有支出紀錄"].join("\n"),
      buildExpenseQuickReply()
    );
  }

  return withQuickReply(
    [
      `目前活動：${result.activeLedger.name}`,
      `目前消費總額：NT$ ${formatCents(result.totalExpenseCents)}`,
      "最近支出：",
      ...result.expenses.map(formatExpenseLine)
    ].join("\n"),
    buildExpenseQuickReply()
  );
}

async function handleDeleteLastExpense(event: LineMessageEvent) {
  const required = await requireGroupContext(event);
  if (!required.ok) {
    return required.message;
  }

  const activeLedger = await getActiveLedger(required.context.group.id);

  if (!activeLedger) {
    return getNoActiveLedgerText();
  }

  const latestExpense = await db.expense.findFirst({
    where: {
      ledgerId: activeLedger.id
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (!latestExpense) {
    return `目前活動 ${activeLedger.name} 還沒有可刪除的紀錄。`;
  }

  await db.expense.delete({
    where: {
      id: latestExpense.id
    }
  });

  const settlement = await calculateSettlement(activeLedger.id);
  const settlementLines =
    settlement?.lines.length && settlement.lines[0] !== "目前已經結清，不用再轉帳。"
      ? settlement.lines
      : ["目前已經結清，不用再轉帳。"];

  return [
    `已刪除：${latestExpense.title}`,
    `金額：NT$ ${formatSpeechAmount(latestExpense.amountCents)}`,
    "",
    `目前活動：${activeLedger.name}`,
    ...settlementLines
  ].join("\n");
}

async function handleSettlement(event: LineMessageEvent) {
  const required = await requireGroupContext(event);
  if (!required.ok) {
    return required.message;
  }

  const snapshot = await getSettlementSnapshot(required.context.group.id);

  if (!snapshot?.activeLedger) {
    return getNoActiveLedgerText();
  }

  return withQuickReply(
    getSettlementSummaryText({
      activityName: snapshot.activeLedger.name,
      totalExpenseDisplay: snapshot.summary.totalExpenseDisplay,
      transfers: snapshot.summary.settlement
    }),
    buildSettlementResultQuickReply()
  );
}

async function handleMvp(event: LineMessageEvent) {
  const required = await requireGroupContext(event);
  if (!required.ok) {
    return required.message;
  }

  const snapshot = await getActiveLedgerExpenseMvp(required.context.group.id);

  if (!snapshot?.activeLedger) {
    return getNoActiveLedgerText();
  }

  if (!snapshot.winner) {
    return withQuickReply(
      `目前活動：${snapshot.activeLedger.name}\n目前還沒有支出資料，還選不出代墊 MVP。`,
      buildSettlementResultQuickReply()
    );
  }

  return withQuickReply(
    getMvpText({
      activityName: snapshot.activeLedger.name,
      memberName: snapshot.winner.memberName,
      advanceCount: snapshot.winner.advanceCount,
      totalPaidCents: snapshot.winner.totalPaidCents
    }),
    buildSettlementResultQuickReply()
  );
}

async function handleArchivePrompt(event: LineMessageEvent) {
  const required = await requireGroupContext(event);
  if (!required.ok) {
    return required.message;
  }

  const { chatId, lineUserId } = getChatContext(event.source);

  if (!lineUserId) {
    return getMissingLineIdentityMessage();
  }

  const activeLedger = await getActiveLedger(required.context.group.id);

  if (!activeLedger) {
    return getNoActiveLedgerText();
  }

  if (activeLedger.creatorLineUserId && activeLedger.creatorLineUserId !== lineUserId) {
    return "只有活動建立者可以結束並封存活動。";
  }

  await createPendingAction({
    groupId: required.context.group.id,
    chatId,
    requesterLineUserId: lineUserId,
    actionType: PendingActionType.archive_active_ledger,
    targetLedgerId: activeLedger.id
  });

  return [
    "提醒大人：請先確認本次費用是否都已結清。",
    "確定要結束並封存這次活動嗎？",
    "請回覆：是 或 否"
  ].join("\n");
}

async function handleArchivedLedgers(event: LineMessageEvent) {
  const required = await requireGroupContext(event);
  if (!required.ok) {
    return required.message;
  }

  const ledgers = await getArchivedLedgerSnapshots(required.context.group.id, 5);

  if (ledgers.length === 0) {
    return withQuickReply("目前沒有封存帳本。", buildArchivedLedgerQuickReply());
  }

  return withQuickReply(
    [
      "封存帳本：",
      ...ledgers.map((ledger) => {
        const mvpText = ledger.mvp
          ? `${ledger.mvp.memberName} / ${ledger.mvp.advanceCount} 次`
          : "尚無";

        return [
          `【${ledger.name}】`,
          `總金額：NT$ ${ledger.totalExpenseDisplay}`,
          `代墊MVP：${mvpText}`,
          `成員：${ledger.members.join("、") || "無"}`
        ].join("\n");
      })
    ].join("\n\n"),
    buildArchivedLedgerQuickReply()
  );
}

async function handleCurrentLedger(event: LineMessageEvent) {
  const required = await requireGroupContext(event);
  if (!required.ok) {
    return required.message;
  }

  const activeLedger = await getActiveLedger(required.context.group.id);
  return activeLedger
    ? `目前活動：${activeLedger.name}`
    : getNoActiveLedgerText();
}

async function handleSwitchLedger(event: LineMessageEvent, name: string) {
  const required = await requireGroupContext(event);
  if (!required.ok) {
    return required.message;
  }

  const result = await switchActiveLedger(required.context.group.id, name);
  return result.previousActiveName
    ? `已切換到活動：${result.ledger.name}\n上一個活動 ${result.previousActiveName} 已自動關閉`
    : `已切換到活動：${result.ledger.name}`;
}

async function handleListLedgers(event: LineMessageEvent) {
  const required = await requireGroupContext(event);
  if (!required.ok) {
    return required.message;
  }

  const ledgers = await listLedgers(required.context.group.id);
  return getLedgerListText(ledgers);
}

async function handleResetLedger(event: LineMessageEvent) {
  const required = await requireGroupContext(event);
  if (!required.ok) {
    return required.message;
  }

  const closed = await closeActiveLedger(required.context.group.id);
  return closed ? `已重置活動：${closed.name}` : getNoActiveLedgerText();
}

async function handleGroupInfo(event: LineMessageEvent) {
  const required = await requireGroupContext(event);
  if (!required.ok) {
    return required.message;
  }

  const info = await getGroupInfoSummary(required.context.group.id);

  if (!info) {
    return getGroupContextUnavailableMessage();
  }

  return [
    `群組名稱：${info.name}`,
    `群組狀態：${info.status}`,
    `LINE 群組 ID：${info.lineGroupId ?? "無"}`,
    `建立時間：${info.createdAt.toLocaleString("zh-TW", { hour12: false })}`,
    `目前活動：${info.activeLedgerName ?? "尚未建立活動"}`
  ].join("\n");
}

async function handlePendingConfirmation(
  event: LineMessageEvent,
  confirmed: boolean
) {
  const { chatId, lineUserId, chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return "目前沒有需要確認的群組操作。";
  }

  if (!lineUserId) {
    return getMissingLineIdentityMessage();
  }

  const pending = await getPendingAction({
    chatId,
    requesterLineUserId: lineUserId
  });

  if (!pending) {
    return "目前沒有等待你確認的操作。";
  }

  await clearPendingAction({
    chatId,
    requesterLineUserId: lineUserId
  });

  if (!confirmed) {
    if (pending.actionType === AWAITING_ACTIVITY_NAME_ACTION) {
      return "已取消建立活動";
    }

    return "已取消操作";
  }

  if (pending.actionType === PendingActionType.archive_active_ledger) {
    const archived = pending.targetLedgerId
      ? await archiveActiveLedger(pending.groupId)
      : null;

    if (!archived) {
      return "找不到要封存的活動。";
    }

    return `已封存活動：${archived.name}`;
  }

  if (pending.actionType === PendingActionType.delete_recent_expense) {
    if (!pending.targetExpenseId) {
      return "找不到要刪除的支出。";
    }

    const expense = await db.expense.findUnique({
      where: {
        id: pending.targetExpenseId
      }
    });

    if (!expense) {
      return "找不到要刪除的支出。";
    }

    await db.expense.delete({
      where: {
        id: expense.id
      }
    });

    return `已刪除一筆 ${formatSpeechAmount(expense.amountCents)} 元的支出`;
  }

  if (pending.actionType === AWAITING_ACTIVITY_NAME_ACTION) {
    return getAwaitingActivityNamePrompt();
  }

  return "目前沒有等待你確認的操作。";
}

async function handleResolvedCommand(
  event: LineMessageEvent,
  command: ParsedLineCommand
): Promise<LineTextReplyPayload | null> {
  const { chatId, chatType, lineUserId } = getChatContext(event.source);

  switch (command.kind) {
    case "ignored":
      return null;

    case "menu-context-required":
      return getMenuContextExpiredPrompt();

    case "xiaoer-help": {
      const context = chatType !== "user" ? await getOrCreateGroupContext(event.source) : null;

      if (lineUserId) {
        await rememberMenuContext({
          chatId,
          lineUserId,
          groupId: context?.group.id ?? null,
          mode: "xiaoer"
        });
      }

      return withQuickReply(getXiaoerMenuText(), buildAssistantQuickReply());
    }

    case "settlement-help": {
      const context = chatType !== "user" ? await getOrCreateGroupContext(event.source) : null;

      if (lineUserId) {
        await rememberMenuContext({
          chatId,
          lineUserId,
          groupId: context?.group.id ?? null,
          mode: "settlement"
        });
      }

      return withQuickReply(getSettlementMenuText(), buildSettlementQuickReply());
    }

    case "create-ledger-help": {
      const required = await requireGroupContext(event);
      if (!required.ok) {
        return required.message;
      }

      return startAwaitingActivityName({
        groupId: required.context.group.id,
        chatId,
        lineUserId
      });
    }

    case "shortcut": {
      const resolved = await resolveShortcutCommand(event, command.number, command.payload);
      return handleResolvedCommand(event, resolved);
    }

    case "join-activity":
      return handleJoinOrLeaveWithRoster(event, "join");

    case "leave-activity":
      return handleJoinOrLeaveWithRoster(event, "leave");

    case "confirm-members":
      return handleConfirmMembers(event);

    case "confirm":
      return handlePendingConfirmation(event, true);

    case "cancel":
      return handlePendingConfirmation(event, false);

    case "create-ledger":
      if (!command.name) {
        const required = await requireGroupContext(event);
        if (!required.ok) {
          return required.message;
        }

        return startAwaitingActivityName({
          groupId: required.context.group.id,
          chatId,
          lineUserId
        });
      }

      return handleCreateLedgerCommand(event, command.name);

    case "switch-ledger":
      return handleSwitchLedger(event, command.name);

    case "current-ledger":
      return handleCurrentLedger(event);

    case "reset-ledger":
      return handleResetLedger(event);

    case "group-info":
      return handleGroupInfo(event);

    case "list-ledgers":
      return handleListLedgers(event);

    case "close-ledger":
      return handleArchivePrompt(event);

    case "archive-ledger": {
      const required = await requireGroupContext(event);
      if (!required.ok) {
        return required.message;
      }

      const archived = await archiveLedger(required.context.group.id, command.name);
      return `已封存活動：${archived.name}`;
    }

    case "list-archived-ledgers":
      return handleArchivedLedgers(event);

    case "delete-last-expense":
      return handleDeleteLastExpense(event);

    case "settlement":
      return handleSettlement(event);

    case "mvp":
      return handleMvp(event);

    case "recent-expenses":
      return handleRecentExpenses(event);

    case "expense-help":
      return withQuickReply(getExpenseGuideText(), buildExpenseQuickReply());

    case "create-group":
      return "現在不用先建立群組，直接在群組裡輸入「建立活動 活動名稱」就可以開始。";

    case "bind":
      return "現在也不用手動綁定群組，小二會自動記住這個群組。";

    case "identify-self":
      if (chatType !== "user") {
        return getPaymentSetupGuideText();
      }

      if (!lineUserId) {
        return getMissingLineIdentityMessage();
      }

      return startPaymentSetup(lineUserId, command.name);

    case "start-payment-setup":
      if (chatType !== "user") {
        return getPaymentSetupGuideText();
      }

      if (!lineUserId) {
        return getMissingLineIdentityMessage();
      }

      return startPaymentSetup(lineUserId);

    case "list-members":
      return handleListMembers(event);

    case "expense":
      return handleExpenseCommand(event, command);

    default:
      return null;
  }
}

async function handleMessageEvent(event: LineMessageEvent) {
  const { chatId, chatType, lineUserId } = getChatContext(event.source);

  if (!chatId) {
    return "目前抓不到這個聊天室，請稍後再試。";
  }

  if (lineUserId && chatType === "user") {
    const profile = await db.lineUserProfile.findUnique({
      where: { lineUserId }
    });

    if (profile?.setupState) {
      const paymentReply = await handlePaymentSetupResponse(lineUserId, event.message.text);
      if (paymentReply) {
        return paymentReply;
      }
    }
  }

  const rawText = event.message.text.trim();
  const parsed = parseLineCommand(event.message.text);

  if (lineUserId) {
    const pendingState = await getPendingActionState({
      chatId,
      requesterLineUserId: lineUserId,
      actionType: AWAITING_ACTIVITY_NAME_ACTION
    });

    if (pendingState.pending) {
      if (parsed.kind === "cancel") {
        await clearPendingAction({
          chatId,
          requesterLineUserId: lineUserId,
          actionType: AWAITING_ACTIVITY_NAME_ACTION
        });

        return "已取消建立活動";
      }

      if (parsed.kind === "ignored" && rawText) {
        return handleCreateLedgerFromPending(event, rawText);
      }
    } else if (pendingState.expired && parsed.kind === "ignored" && rawText) {
      return getAwaitingActivityNameExpiredPrompt();
    }
  }

  if (parsed.kind === "confirm") {
    return handlePendingConfirmation(event, true);
  }

  if (parsed.kind === "cancel") {
    return handlePendingConfirmation(event, false);
  }

  if (parsed.kind === "shortcut") {
    const resolved = await resolveShortcutCommand(event, parsed.number, parsed.payload);
    return handleResolvedCommand(event, resolved);
  }

  return handleResolvedCommand(event, parsed);
}

export async function handleLineEvent(event: LineEvent, _appBaseUrl?: string) {
  if (event.type === "join") {
    await getOrCreateGroupContext(event.source);
    return getWelcomeJoinMessage();
  }

  if (event.type === "follow") {
    return "歡迎把小二加進群組。進群後直接輸入「建立活動 活動名稱」就能開始。";
  }

  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  return handleMessageEvent(event);
}
