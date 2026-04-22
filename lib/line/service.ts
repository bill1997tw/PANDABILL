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
import { getCollectingMemberUpdateText } from "@/lib/commands/participant-roster";
import { formatPaymentSummary } from "@/lib/commands/payment";
import {
  clearPendingAction,
  createPendingAction,
  getPendingAction
} from "@/lib/commands/pending";
import {
  getActiveMenuContext,
  getMenuContextExpiredPrompt,
  rememberMenuContext,
  resolveMenuModeFromContext
} from "@/lib/commands/menu-context";
import { getMvpText, getSettlementSummaryText } from "@/lib/commands/settlement";
import { formatCents } from "@/lib/currency";
import { db } from "@/lib/db";
import {
  createExpenseInGroup,
  createGroup,
  formatExpenseLine,
  getActiveLedgerExpenseMvp,
  getArchivedLedgerSnapshots,
  getConfirmedMemberIdsForActiveLedger,
  getRecentExpenses,
  getSettlementSnapshot
} from "@/lib/group-service";
import {
  archiveActiveLedger,
  confirmCollectingLedger,
  createLedgerForGroup,
  getActiveLedger,
  getActiveLedgerParticipants,
  joinCollectingLedger,
  listLedgers,
  leaveCollectingLedger,
  switchActiveLedger
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
import type { LineEvent, LineMessageEvent, ParsedLineCommand } from "@/lib/line/types";

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

async function getBoundGroup(chatId: string) {
  return db.lineChatBinding.findUnique({
    where: {
      chatId
    },
    include: {
      group: {
        include: {
          members: {
            orderBy: {
              createdAt: "asc"
            }
          }
        }
      }
    }
  });
}

function getGroupOnlyMessage() {
  return "這個功能請在 LINE 群組中使用。";
}

function getBindGroupMessage() {
  return "這個聊天室還沒綁定群組，請先輸入：綁定群組 綁定碼";
}

function parseBooleanChoice(text: string) {
  const normalized = text.trim();

  if (["是", "可以", "可", "收", "y", "Y", "yes", "YES"].includes(normalized)) {
    return true;
  }

  if (["否", "不可以", "不可", "不收", "n", "N", "no", "NO"].includes(normalized)) {
    return false;
  }

  return null;
}

function isSkipText(text: string) {
  return ["略過", "跳過", "無", "沒有", "skip"].includes(text.trim());
}

function formatSpeechAmount(cents: number) {
  if (cents % 100 === 0) {
    return new Intl.NumberFormat("zh-TW").format(cents / 100);
  }

  return formatCents(cents);
}

async function resolveActorDisplayName(event: LineMessageEvent) {
  const displayName = await getLineDisplayName(event.source);

  if (displayName) {
    return displayName;
  }

  if (event.source.userId) {
    const profile = await db.lineUserProfile.findUnique({
      where: {
        lineUserId: event.source.userId
      }
    });

    if (profile?.memberName) {
      return profile.memberName;
    }

    return `成員${event.source.userId.slice(-4)}`;
  }

  return "未知成員";
}

async function bindGroup(
  chatId: string,
  chatType: string,
  lineUserId: string | undefined,
  target: string
) {
  const normalizedTarget = target.trim();
  const upperCode = normalizedTarget.toUpperCase();

  const group = await db.group.findFirst({
    where: {
      OR: [
        {
          lineJoinCode: upperCode
        },
        {
          name: normalizedTarget
        }
      ]
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (!group) {
    return "找不到要綁定的群組，請確認綁定碼或群組名稱。";
  }

  await db.lineChatBinding.upsert({
    where: { chatId },
    update: {
      groupId: group.id,
      chatType,
      lineUserId,
      pendingDeleteExpenseId: null
    },
    create: {
      chatId,
      chatType,
      lineUserId,
      groupId: group.id
    }
  });

  return `已綁定群組：${group.name}`;
}

async function startPaymentSetup(lineUserId: string) {
  const profile = await getOrCreateLineUserProfile(lineUserId);
  const draft = defaultPaymentSetupDraft({
    memberName: profile.memberName,
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

    return ["好勒，先讓小二知道你是誰。", "請輸入：我是你的名字"].join("\n");
  }

  await updateLineUserProfileDraft(
    lineUserId,
    PAYMENT_SETUP_STEPS.awaitingBankChoice,
    draft
  );

  return ["先設定銀行匯款。", "銀行匯款可以收嗎？請回覆：是 或 否"].join("\n");
}

async function finishPaymentSetup(lineUserId: string, draft: PaymentSetupDraft) {
  await db.lineUserProfile.upsert({
    where: { lineUserId },
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
    memberName: draft.memberName ?? "未知成員",
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

      return "銀行匯款可以收嗎？請回覆：是 或 否";
    }

    case PAYMENT_SETUP_STEPS.awaitingBankChoice: {
      const choice = parseBooleanChoice(message);

      if (choice === null) {
        return "請回覆：是 或 否";
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

      return "LINE Pay 可以收嗎？請回覆：是 或 否";
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

      return "LINE Pay 可以收嗎？請回覆：是 或 否";
    }

    case PAYMENT_SETUP_STEPS.awaitingLinePayChoice: {
      const choice = parseBooleanChoice(message);

      if (choice === null) {
        return "請回覆：是 或 否";
      }

      draft.acceptLinePay = choice;
      await updateLineUserProfileDraft(
        lineUserId,
        PAYMENT_SETUP_STEPS.awaitingCashChoice,
        draft
      );

      return "現金可以收嗎？請回覆：是 或 否";
    }

    case PAYMENT_SETUP_STEPS.awaitingCashChoice: {
      const choice = parseBooleanChoice(message);

      if (choice === null) {
        return "請回覆：是 或 否";
      }

      draft.acceptCash = choice;
      await updateLineUserProfileDraft(
        lineUserId,
        PAYMENT_SETUP_STEPS.awaitingNote,
        draft
      );

      return "有要補充的備註嗎？沒有的話回覆：略過";
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
  const { chatId, lineUserId, chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getBoundGroup(chatId);
  if (!binding) {
    return getBindGroupMessage();
  }

  const displayName = await resolveActorDisplayName(event);
  const result = await createLedgerForGroup(binding.group.id, name, {
    lineUserId,
    displayName
  });

  await rememberMenuContext({
    chatId,
    lineUserId,
    groupId: binding.group.id,
    mode: "xiaoer"
  });

  const activeParticipants = await getActiveLedgerParticipants(binding.group.id);
  const memberNames = activeParticipants.participants.map(
    (participant) => participant.displayName
  );

  if (result.previousActiveName) {
    return [
      `已建立活動：${result.ledger.name}，並設為目前帳本`,
      `上一個活動 ${result.previousActiveName} 已自動結束`,
      getCollectingMembersPrompt(result.ledger.name, memberNames)
    ].join("\n\n");
  }

  return getCollectingMembersPrompt(result.ledger.name, memberNames);
}

async function handleJoinOrLeave(
  event: LineMessageEvent,
  action: "join" | "leave"
) {
  const { chatId, lineUserId, chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getBoundGroup(chatId);
  if (!binding) {
    return getBindGroupMessage();
  }

  const displayName = await resolveActorDisplayName(event);
  const result =
    action === "join"
      ? await joinCollectingLedger({
          groupId: binding.group.id,
          lineUserId,
          displayName
        })
      : await leaveCollectingLedger({
          groupId: binding.group.id,
          lineUserId,
          displayName
        });

  if (result.status === "no-ledger") {
    return getNoActiveLedgerText();
  }

  if (result.status === "not-collecting") {
    return "這個活動已經確認成員了，現在不能再用 +1 / -1 報名。";
  }

  if (result.status === "already-joined") {
    return `${displayName} 已經在名單裡了`;
  }

  if (result.status === "not-joined") {
    return `${displayName} 目前不在名單裡`;
  }

  return action === "join" ? `${displayName}已加入` : `${displayName}已退出`;
}

async function handleJoinOrLeaveWithRoster(
  event: LineMessageEvent,
  action: "join" | "leave"
) {
  const { chatId, lineUserId, chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getBoundGroup(chatId);
  if (!binding) {
    return getBindGroupMessage();
  }

  const displayName = await resolveActorDisplayName(event);
  const result =
    action === "join"
      ? await joinCollectingLedger({
          groupId: binding.group.id,
          lineUserId,
          displayName
        })
      : await leaveCollectingLedger({
          groupId: binding.group.id,
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
  const { chatId, chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getBoundGroup(chatId);
  if (!binding) {
    return getBindGroupMessage();
  }

  const result = await confirmCollectingLedger(binding.group.id);

  if (result.status === "no-ledger") {
    return getNoActiveLedgerText();
  }

  if (result.status === "no-participants") {
    return "目前還沒有人報名，請先讓大家輸入 +1。";
  }

  if (result.status === "already-confirmed") {
    return "這個活動的成員已經確認完成，現在可以直接記帳。";
  }

  return getConfirmedMembersPrompt(
    result.ledger.name,
    result.participants.map((participant) => participant.displayName)
  );
}

async function resolvePayerMember(input: {
  groupId: string;
  lineUserId?: string;
  displayName: string;
  payerName?: string;
  payerIsSender?: boolean;
}) {
  const group = await db.group.findUnique({
    where: {
      id: input.groupId
    },
    include: {
      members: true
    }
  });

  if (!group) {
    return null;
  }

  if (input.payerIsSender) {
    if (input.lineUserId) {
      const byLineUserId = group.members.find(
        (member) => member.lineUserId === input.lineUserId
      );

      if (byLineUserId) {
        return byLineUserId;
      }
    }

    return group.members.find((member) => member.name === input.displayName) ?? null;
  }

  if (input.payerName) {
    return group.members.find((member) => member.name === input.payerName) ?? null;
  }

  return null;
}

async function handleExpenseCommand(
  event: LineMessageEvent,
  command: Extract<ParsedLineCommand, { kind: "expense" }>
) {
  const { chatId, lineUserId, chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getBoundGroup(chatId);
  if (!binding) {
    return getBindGroupMessage();
  }

  const actorDisplayName = await resolveActorDisplayName(event);
  const confirmed = await getConfirmedMemberIdsForActiveLedger(binding.group.id);

  if (!confirmed.ledger) {
    return getNoActiveLedgerText();
  }

  if (confirmed.ledger.isCollectingMembers) {
    return "請先輸入：確認成員";
  }

  if (confirmed.memberIds.length === 0) {
    return "這次活動還沒有已確認成員，請先輸入：確認成員";
  }

  const payer = await resolvePayerMember({
    groupId: binding.group.id,
    lineUserId,
    displayName: actorDisplayName,
    payerName: command.payerName,
    payerIsSender: command.payerIsSender ?? !command.payerName
  });

  if (!payer) {
    return "我目前認不出付款人，請改成像「晚餐 2000 阿豪付」這種寫法。";
  }

  let participantIds = confirmed.memberIds;

  if (command.participantCount) {
    if (command.participantCount !== confirmed.memberIds.length) {
      return `你寫了 ${command.participantCount} 人分，但目前已確認成員是 ${confirmed.memberIds.length} 人。請補充更明確的寫法。`;
    }

    participantIds = confirmed.memberIds;
  }

  const result = await createExpenseInGroup({
    groupId: binding.group.id,
    title: command.title,
    amount: command.amount,
    payerId: payer.id,
    participantIds,
    notes: "由 LINE Bot 記錄"
  });

  return [
    `已記錄到活動：${result.ledger.name}`,
    `${result.expense.title}`,
    `金額：NT$ ${result.expense.amountDisplay}`,
    `付款人：${result.expense.payer.name}`,
    `分攤人數：${result.expense.participants.length} 人`
  ].join("\n");
}

async function handleRecentExpenses(chatId: string, chatType: "user" | "group" | "room") {
  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getBoundGroup(chatId);
  if (!binding) {
    return getBindGroupMessage();
  }

  const result = await getRecentExpenses(binding.group.id, 5);

  if (!result.activeLedger) {
    return getNoActiveLedgerText();
  }

  if (result.expenses.length === 0) {
    return [`目前活動：${result.activeLedger.name}`, "目前還沒有支出紀錄"].join("\n");
  }

  return [
    `目前活動：${result.activeLedger.name}`,
    `目前消費總額：NT$ ${formatCents(result.totalExpenseCents)}`,
    "最近支出：",
    ...result.expenses.map(formatExpenseLine)
  ].join("\n");
}

async function handleDeleteLastExpense(event: LineMessageEvent) {
  const { chatId, lineUserId, chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  if (!lineUserId) {
    return "目前無法辨識你是誰，請稍後再試。";
  }

  const binding = await getBoundGroup(chatId);
  if (!binding) {
    return getBindGroupMessage();
  }

  const activeLedger = await getActiveLedger(binding.group.id);
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
    return `目前活動 ${activeLedger.name} 還沒有支出可以刪除。`;
  }

  await createPendingAction({
    groupId: binding.group.id,
    chatId,
    requesterLineUserId: lineUserId,
    actionType: PendingActionType.delete_recent_expense,
    targetExpenseId: latestExpense.id
  });

  return "確定要刪除最近一筆支出嗎？請回覆 是 或 否";
}

async function handleSettlement(chatId: string, chatType: "user" | "group" | "room") {
  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getBoundGroup(chatId);
  if (!binding) {
    return getBindGroupMessage();
  }

  const snapshot = await getSettlementSnapshot(binding.group.id);

  if (!snapshot?.activeLedger) {
    return getNoActiveLedgerText();
  }

  return getSettlementSummaryText({
    activityName: snapshot.activeLedger.name,
    totalExpenseDisplay: snapshot.summary.totalExpenseDisplay,
    transfers: snapshot.summary.settlement
  });
}

async function handleMvp(chatId: string, chatType: "user" | "group" | "room") {
  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getBoundGroup(chatId);
  if (!binding) {
    return getBindGroupMessage();
  }

  const snapshot = await getActiveLedgerExpenseMvp(binding.group.id);

  if (!snapshot?.activeLedger) {
    return getNoActiveLedgerText();
  }

  if (!snapshot.winner) {
    return `目前活動：${snapshot.activeLedger.name}\n目前還沒有支出資料，還選不出代墊 MVP。`;
  }

  return getMvpText({
    activityName: snapshot.activeLedger.name,
    memberName: snapshot.winner.memberName,
    advanceCount: snapshot.winner.advanceCount,
    totalPaidCents: snapshot.winner.totalPaidCents
  });
}

async function handleArchivePrompt(event: LineMessageEvent) {
  const { chatId, lineUserId, chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  if (!lineUserId) {
    return "目前無法辨識你是誰，請稍後再試。";
  }

  const binding = await getBoundGroup(chatId);
  if (!binding) {
    return getBindGroupMessage();
  }

  const activeLedger = await getActiveLedger(binding.group.id);
  if (!activeLedger) {
    return getNoActiveLedgerText();
  }

  if (activeLedger.creatorLineUserId && activeLedger.creatorLineUserId !== lineUserId) {
    return "只有建立活動的人可以結束並封存這次活動。";
  }

  await createPendingAction({
    groupId: binding.group.id,
    chatId,
    requesterLineUserId: lineUserId,
    actionType: PendingActionType.archive_active_ledger,
    targetLedgerId: activeLedger.id
  });

  return [
    "提醒大人：請先確認本次費用是否都已結清。",
    "確定要結束並封存這次活動嗎？",
    "請回覆 是 或 否"
  ].join("\n");
}

async function handleArchivedLedgers(chatId: string, chatType: "user" | "group" | "room") {
  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getBoundGroup(chatId);
  if (!binding) {
    return getBindGroupMessage();
  }

  const ledgers = await getArchivedLedgerSnapshots(binding.group.id, 5);

  if (ledgers.length === 0) {
    return "目前沒有封存帳本。";
  }

  return [
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
  ].join("\n\n");
}

async function handlePendingConfirmation(event: LineMessageEvent, approved: boolean) {
  const { chatId, lineUserId } = getChatContext(event.source);

  if (!lineUserId) {
    return null;
  }

  const pending = await getPendingAction(chatId);

  if (!pending || pending.requesterLineUserId !== lineUserId) {
    return null;
  }

  if (!approved) {
    await clearPendingAction(chatId);
    return "好勒，這次就先取消。";
  }

  if (pending.actionType === PendingActionType.delete_recent_expense) {
    const expense = await db.expense.findUnique({
      where: {
        id: pending.targetExpenseId ?? ""
      }
    });

    await clearPendingAction(chatId);

    if (!expense) {
      return "找不到要刪除的那筆支出，可能已經被刪掉了。";
    }

    await db.expense.delete({
      where: {
        id: expense.id
      }
    });

    return `已刪除一筆 ${formatSpeechAmount(expense.amountCents)} 元的支出`;
  }

  if (pending.actionType === PendingActionType.archive_active_ledger) {
    const binding = await getBoundGroup(chatId);
    await clearPendingAction(chatId);

    if (!binding) {
      return getBindGroupMessage();
    }

    const archived = await archiveActiveLedger(binding.group.id);

    if (!archived) {
      return getNoActiveLedgerText();
    }

    return `已結束並封存活動：${archived.name}`;
  }

  return null;
}

async function handleMessageEvent(event: LineMessageEvent) {
  const { chatId, chatType, lineUserId } = getChatContext(event.source);

  if (!chatId) {
    return "目前無法判斷聊天室資訊，請稍後再試。";
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

  const parsed = parseLineCommand(event.message.text);

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

async function handleResolvedCommand(event: LineMessageEvent, command: ParsedLineCommand) {
  const { chatId, chatType, lineUserId } = getChatContext(event.source);

  switch (command.kind) {
    case "ignored":
      return null;

    case "menu-context-required":
      return getMenuContextExpiredPrompt();

    case "xiaoer-help":
      if (lineUserId) {
        const binding = chatType !== "user" ? await getBoundGroup(chatId) : null;
        await rememberMenuContext({
          chatId,
          lineUserId,
          groupId: binding?.group.id ?? null,
          mode: "xiaoer"
        });
      }
      return getXiaoerMenuText();

    case "settlement-help":
      if (lineUserId) {
        const binding = chatType !== "user" ? await getBoundGroup(chatId) : null;
        await rememberMenuContext({
          chatId,
          lineUserId,
          groupId: binding?.group.id ?? null,
          mode: "settlement"
        });
      }
      return getSettlementMenuText();

    case "join-activity":
      return handleJoinOrLeaveWithRoster(event, "join");

    case "leave-activity":
      return handleJoinOrLeaveWithRoster(event, "leave");

    case "confirm-members":
      return handleConfirmMembers(event);

    case "create-ledger":
      if (!command.name) {
        return "請輸入：1活動名稱 或 建立活動 活動名稱";
      }
      return handleCreateLedgerCommand(event, command.name);

    case "create-ledger-help":
      return "請輸入：1活動名稱 或 建立活動 活動名稱";

    case "switch-ledger":
      if (chatType === "user") {
        return getGroupOnlyMessage();
      }

      if (!command.name) {
        return "請輸入：切換活動 活動名稱";
      }

      return (async () => {
        const binding = await getBoundGroup(chatId);
        if (!binding) {
          return getBindGroupMessage();
        }

        const result = await switchActiveLedger(binding.group.id, command.name);
        return result.previousActiveName
          ? `已切換到活動：${result.ledger.name}\n原本活動 ${result.previousActiveName} 已自動關閉`
          : `已切換到活動：${result.ledger.name}`;
      })();

    case "current-ledger":
      if (chatType === "user") {
        return getGroupOnlyMessage();
      }

      return (async () => {
        const binding = await getBoundGroup(chatId);
        if (!binding) {
          return getBindGroupMessage();
        }

        const activeLedger = await getActiveLedger(binding.group.id);
        return activeLedger
          ? `目前活動：${activeLedger.name}`
          : getNoActiveLedgerText();
      })();

    case "list-ledgers":
      if (chatType === "user") {
        return getGroupOnlyMessage();
      }

      return (async () => {
        const binding = await getBoundGroup(chatId);
        if (!binding) {
          return getBindGroupMessage();
        }

        const ledgers = await listLedgers(binding.group.id);
        return getLedgerListText(
          ledgers.map((ledger) => ({
            name: ledger.name,
            isActive: ledger.isActive,
            status: ledger.status
          }))
        );
      })();

    case "close-ledger":
      return handleArchivePrompt(event);

    case "archive-ledger":
      if (chatType === "user") {
        return getGroupOnlyMessage();
      }

      return (async () => {
        const binding = await getBoundGroup(chatId);
        if (!binding) {
          return getBindGroupMessage();
        }

        const archived = await archiveActiveLedger(binding.group.id);
        return archived
          ? `已封存活動：${archived.name}`
          : getNoActiveLedgerText();
      })();

    case "list-archived-ledgers":
      return handleArchivedLedgers(chatId, chatType);

    case "delete-last-expense":
      return handleDeleteLastExpense(event);

    case "settlement":
      return handleSettlement(chatId, chatType);

    case "mvp":
      return handleMvp(chatId, chatType);

    case "recent-expenses":
      return handleRecentExpenses(chatId, chatType);

    case "expense-help":
      return getExpenseGuideText();

    case "start-payment-setup":
      if (!lineUserId || chatType !== "user") {
        return getPaymentSetupGuideText();
      }
      return startPaymentSetup(lineUserId);

    case "identify-self":
      if (!lineUserId || chatType !== "user") {
        return getPaymentSetupGuideText();
      }

      await db.lineUserProfile.upsert({
        where: {
          lineUserId
        },
        update: {
          memberName: command.name
        },
        create: {
          lineUserId,
          memberName: command.name
        }
      });

      return `好勒，先記住你是 ${command.name}。\n接著輸入：設定收款方式`;

    case "create-group": {
      const group = await createGroup(command.name);

      await db.lineChatBinding.upsert({
        where: { chatId },
        update: {
          groupId: group.id,
          chatType,
          lineUserId,
          pendingDeleteExpenseId: null
        },
        create: {
          chatId,
          chatType,
          lineUserId,
          groupId: group.id
        }
      });

      return `已建立群組：${group.name}\n綁定碼：${group.lineJoinCode}`;
    }

    case "bind":
      return bindGroup(chatId, chatType, lineUserId, command.target);

    case "expense":
      return handleExpenseCommand(event, command);

    case "confirm":
    case "cancel":
    case "shortcut":
      return null;
  }
}

export async function handleLineEvent(event: LineEvent, _appBaseUrl: string) {
  if (event.type === "follow" || event.type === "join") {
    return [
      "小二來了！",
      "群組裡輸入「小二」看操作入口，輸入「算帳」看結算功能。"
    ].join("\n");
  }

  if (event.type === "message" && event.message.type === "text") {
    return handleMessageEvent(event);
  }

  return null;
}
