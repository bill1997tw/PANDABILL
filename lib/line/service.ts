import { PendingActionType, Prisma } from "@prisma/client";

import {
  getCollectingMembersPrompt,
  getConfirmedMembersPrompt,
  getLedgerListText,
  getNoActiveLedgerText
} from "@/lib/commands/activity";
import {
  parseExpenseDraftHeader,
  parseExpensePayerLine,
  parseExpenseShareLine,
  parseNaturalExpense,
  splitMultilineSegments
} from "@/lib/commands/expense";
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
import {
  clearPendingAction,
  createPendingAction,
  getPendingAction,
  getPendingActionState
} from "@/lib/commands/pending";
import {
  formatPaymentSummary,
  getBankAccountInvalidPrompt,
  getBankAccountPrompt,
  getOtherPaymentPrompt,
  getPaymentNotePrompt,
  getPaymentSelectionInvalidText,
  getPaymentSetupMenuText,
  parsePaymentSelectionInput
} from "@/lib/commands/payment";
import { getCollectingMemberUpdateText } from "@/lib/commands/participant-roster";
import { getMvpText, getSettlementSummaryText } from "@/lib/commands/settlement";
import { formatCents, parseAmountToCents } from "@/lib/currency";
import { db } from "@/lib/db";
import {
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
  listLedgers,
  joinCollectingLedger,
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
import type { LineEvent, LineJoinLikeEvent, LineMessageEvent, ParsedLineCommand } from "@/lib/line/types";

const AWAITING_ACTIVITY_NAME_ACTION = PendingActionType.awaiting_activity_name;
const AWAITING_EXPENSE_DETAILS_ACTION = PendingActionType.awaiting_expense_details;
const JOIN_LEAVE_SELECTION_TTL_MS = 5 * 60 * 1000;
const joinLeaveSelectionState = new Map<string, number>();

type PendingExpenseDraft = {
  title: string;
  amount: string;
  payerName: string | null;
  payerIsSender: boolean;
  shares: Array<{
    participantName: string;
    amount: string;
  }>;
};

type ConfirmedParticipantRef = Awaited<
  ReturnType<typeof getConfirmedMemberIdsForActiveLedger>
>["participants"][number];

function getJoinLeaveSelectionStateKey(chatId: string, lineUserId?: string) {
  return lineUserId ? `${chatId}:${lineUserId}` : null;
}

function activateJoinLeaveSelectionState(chatId: string, lineUserId?: string) {
  const key = getJoinLeaveSelectionStateKey(chatId, lineUserId);
  if (!key) {
    return;
  }

  joinLeaveSelectionState.set(key, Date.now() + JOIN_LEAVE_SELECTION_TTL_MS);
}

function clearJoinLeaveSelectionState(chatId: string, lineUserId?: string) {
  const key = getJoinLeaveSelectionStateKey(chatId, lineUserId);
  if (!key) {
    return;
  }

  joinLeaveSelectionState.delete(key);
}

function hasActiveJoinLeaveSelectionState(chatId: string, lineUserId?: string) {
  const key = getJoinLeaveSelectionStateKey(chatId, lineUserId);
  if (!key) {
    return false;
  }

  const expiresAt = joinLeaveSelectionState.get(key);
  if (!expiresAt) {
    return false;
  }

  if (expiresAt < Date.now()) {
    joinLeaveSelectionState.delete(key);
    return false;
  }

  return true;
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

function isUrlLikeText(text: string) {
  const normalized = text.trim().toLowerCase();
  return normalized.startsWith("http://") || normalized.startsWith("https://");
}

function isGroupWhitelistedCommand(parsed: ParsedLineCommand) {
  switch (parsed.kind) {
    case "xiaoer-help":
    case "settlement-help":
    case "create-ledger":
    case "create-ledger-help":
    case "expense-help":
    case "recent-expenses":
    case "delete-last-expense":
    case "confirm-members":
    case "start-payment-setup":
    case "join-activity":
    case "leave-activity":
    case "cancel":
    case "settlement":
    case "mvp":
    case "list-ledgers":
    case "list-archived-ledgers":
      return true;
    default:
      return false;
  }
}

function mapGroupFallbackCommand(rawText: string, parsed: ParsedLineCommand): ParsedLineCommand {
  if (parsed.kind !== "ignored") {
    return parsed;
  }

  const normalized = rawText.trim();

  if (normalized === "加入活動") {
    return { kind: "join-activity" };
  }

  if (normalized === "查看封存帳本") {
    return { kind: "list-archived-ledgers" };
  }

  if (normalized === "查看帳本" || normalized === "帳本" || normalized === "帳本列表") {
    return { kind: "list-ledgers" };
  }

  return parsed;
}

function formatAmountForDisplay(cents: number) {
  return cents % 100 === 0 ? String(cents / 100) : formatCents(cents);
}

function buildSettlementBlock(lines: string[]) {
  return ["目前結算：", ...lines].join("\n");
}

function getNoFormalSettlementText() {
  return "目前沒有可結算的正式記帳資料。";
}

function getGroupOnlyMessage() {
  return "請在群組裡使用這個功能。";
}

function getNoActiveJoinLeaveLedgerText() {
  return "目前沒有進行中的活動，請先建立活動。";
}

function getMissingLineIdentityMessage() {
  return "目前抓不到你的 LINE 身分，請稍後再試。";
}

function getMissingGroupContextMessage() {
  return "目前找不到這個群組的資料，請稍後再試。";
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

function getAwaitingExpenseExpiredPrompt() {
  return "新增支出已逾時，請重新輸入「新增支出」或重新貼上支出內容。";
}

function getAwaitingExpenseCancelledPrompt() {
  return "已取消新增支出";
}

function getAwaitingExpensePrompt() {
  return [
    "請直接輸入支出內容：",
    "",
    "例如：",
    "晚餐600我付",
    "",
    "或",
    "",
    "飲料185",
    "小明付",
    "100小華",
    "50小美",
    "35小陳"
  ].join("\n");
}

function getAwaitingExpenseInvalidPrompt() {
  return ["格式不正確，請重新輸入。", "", "例如：", "晚餐600我付"].join("\n");
}

function getAwaitingActivityCancelledPrompt() {
  return "已取消建立活動";
}

function getContinuousExpensePrompt() {
  return [
    "請輸入支出內容，可一次輸入多筆：",
    "",
    "例如：",
    "晚餐500我付",
    "飲料200我付",
    "胡椒餅90小明付",
    "",
    "輸入【完成】結束新增支出。"
  ].join("\n");
}

function getContinuousExpenseInvalidPrompt() {
  return ["格式不正確，請重新輸入。", "", "例如：", "晚餐600我付"].join("\n");
}

function getContinuousExpenseSavedPrompt(count: number) {
  return count === 1
    ? "已新增 1 筆支出。\n目前可繼續輸入下一筆，或輸入【完成】結束。"
    : `已新增 ${count} 筆支出。`;
}

function getContinuousExpenseContinuePrompt() {
  return "你可以繼續輸入支出，或輸入【完成】結束。";
}

function isContinuousExpenseCompleteCommand(text: string) {
  return text === "完成" || text === "結束";
}

function isJoinSelectionText(text: string) {
  return text === "+" || text === "+1" || text === "加入";
}

function isLeaveSelectionText(text: string) {
  return text === "-" || text === "-1" || text === "退出";
}

function getChatContext(source: LineEvent["source"]) {
  if (source.type === "group" && source.groupId) {
    return {
      chatId: source.groupId,
      chatType: "group" as const,
      lineUserId: source.userId
    };
  }

  if (source.type === "room" && source.roomId) {
    return {
      chatId: source.roomId,
      chatType: "room" as const,
      lineUserId: source.userId
    };
  }

  return {
    chatId: source.userId ?? "user",
    chatType: "user" as const,
    lineUserId: source.userId
  };
}

async function resolveActorDisplayName(event: LineMessageEvent) {
  const profileName = await getLineDisplayName(event.source);

  if (profileName) {
    return profileName;
  }

  return "使用者";
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function findParticipantByName(
  participants: ConfirmedParticipantRef[],
  name: string
) {
  const normalized = normalizeName(name);

  return participants.find((participant) => {
    return (
      normalizeName(participant.displayName) === normalized ||
      normalizeName(participant.memberName) === normalized
    );
  });
}

function parseExpenseDraftPayload(value: Prisma.JsonValue | null | undefined): PendingExpenseDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (typeof candidate.title !== "string" || typeof candidate.amount !== "string") {
    return null;
  }

  return {
    title: candidate.title,
    amount: candidate.amount,
    payerName: typeof candidate.payerName === "string" ? candidate.payerName : null,
    payerIsSender: candidate.payerIsSender === true,
    shares: Array.isArray(candidate.shares)
      ? candidate.shares
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return null;
            }

            const share = item as Record<string, unknown>;

            if (
              typeof share.participantName !== "string" ||
              typeof share.amount !== "string"
            ) {
              return null;
            }

            return {
              participantName: share.participantName,
              amount: share.amount
            };
          })
          .filter(
            (
              item
            ): item is {
              participantName: string;
              amount: string;
            } => Boolean(item)
          )
      : []
  };
}

function serializeExpenseDraftPayload(draft: PendingExpenseDraft): Prisma.InputJsonValue {
  return {
    title: draft.title,
    amount: draft.amount,
    payerName: draft.payerName,
    payerIsSender: draft.payerIsSender,
    shares: draft.shares
  };
}

function buildExpenseDraft(title: string, amount: string): PendingExpenseDraft {
  return {
    title,
    amount,
    payerName: null,
    payerIsSender: false,
    shares: []
  };
}

function buildExpenseMismatchText(totalCents: number, shareTotalCents: number) {
  const difference = Math.abs(totalCents - shareTotalCents);

  return [
    "細項加總與總金額不一致，請確認金額。",
    "",
    `總金額：${formatAmountForDisplay(totalCents)}`,
    `細項加總：${formatAmountForDisplay(shareTotalCents)}`,
    `差額：${formatAmountForDisplay(difference)}`
  ].join("\n");
}

function shouldStartExpenseDraft(rawText: string, parsed: ParsedLineCommand) {
  if (parsed.kind !== "expense") {
    return false;
  }

  if (rawText.includes("\n")) {
    return false;
  }

  if (/[付]/u.test(rawText)) {
    return false;
  }

  return Boolean(parseExpenseDraftHeader(rawText));
}

function parseExplicitExpenseWhileAwaiting(rawText: string) {
  if (!rawText || rawText.length > 100) {
    return null;
  }

  if (isUrlLikeText(rawText)) {
    return null;
  }

  if (!/\d/.test(rawText) || !rawText.includes("付")) {
    return null;
  }

  return parseNaturalExpense(rawText);
}

function getExpenseNotAllowedText() {
  return "請先確認成員後再新增支出。";
}

function getMissingPayerText(name: string) {
  return [`找不到付款人：${name}`, "", "請確認他是否已加入活動，", "或改用【我付】"].join(
    "\n"
  );
}

function getMissingParticipantText(name: string) {
  return `找不到分攤成員：${name}`;
}

function parseBooleanChoice(text: string) {
  const normalized = text.trim();

  if (["是", "好", "可以", "要", "收", "接受", "有", "Y", "y", "yes", "Yes"].includes(normalized)) {
    return true;
  }

  if (["否", "不要", "不收", "不接受", "沒有", "N", "n", "no", "No"].includes(normalized)) {
    return false;
  }

  return null;
}

async function savePaymentSetup(
  lineUserId: string,
  draft: PaymentSetupDraft
) {
  await db.lineUserProfile.update({
    where: { lineUserId },
    data: {
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
    memberName: draft.memberName ?? "你",
    acceptBankTransfer: draft.acceptBankTransfer,
    bankName: draft.bankName,
    bankAccount: draft.bankAccount,
    acceptLinePay: draft.acceptLinePay,
    acceptCash: draft.acceptCash,
    paymentNote: draft.paymentNote
  });
}

async function continuePaymentSetup(
  lineUserId: string,
  draft: PaymentSetupDraft
) {
  const [nextSelection, ...remainingSelections] = draft.pendingSelections;
  const nextDraft = defaultPaymentSetupDraft({
    ...draft,
    pendingSelections: remainingSelections
  });

  if (!nextSelection) {
    return savePaymentSetup(lineUserId, nextDraft);
  }

  if (nextSelection === 1) {
    await updateLineUserProfileDraft(
      lineUserId,
      PAYMENT_SETUP_STEPS.awaitingBankInfo,
      nextDraft
    );
    return getBankAccountPrompt();
  }

  if (nextSelection === 4) {
    await updateLineUserProfileDraft(
      lineUserId,
      PAYMENT_SETUP_STEPS.awaitingOtherMethod,
      nextDraft
    );
    return getOtherPaymentPrompt();
  }

  if (nextSelection === 5) {
    await updateLineUserProfileDraft(
      lineUserId,
      PAYMENT_SETUP_STEPS.awaitingNote,
      nextDraft
    );
    return getPaymentNotePrompt();
  }

  return savePaymentSetup(lineUserId, nextDraft);
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

async function handleCreateLedgerCommand(event: LineMessageEvent, name: string) {
  const { chatId, lineUserId, chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  if (lineUserId) {
    await clearPendingAction({
      chatId,
      requesterLineUserId: lineUserId,
      actionType: AWAITING_ACTIVITY_NAME_ACTION
    });
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
  const memberNames = activeParticipants.participants.map((participant) => participant.displayName);

  if (result.previousActiveName) {
    return withQuickReply(
      [
        `已建立活動：${result.ledger.name}，並設為目前活動`,
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
  const { chatId, lineUserId, chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

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
  const { chatType, chatId, lineUserId } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
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
    clearJoinLeaveSelectionState(chatId, lineUserId);
    return getCollectingMemberUpdateText({
      type: "already-joined",
      actorName: displayName,
      memberNames: result.participants.map((participant) => participant.displayName)
    });
  }

  if (result.status === "not-joined") {
    clearJoinLeaveSelectionState(chatId, lineUserId);
    return getCollectingMemberUpdateText({
      type: "not-joined",
      actorName: displayName,
      memberNames: result.participants.map((participant) => participant.displayName)
    });
  }

  clearJoinLeaveSelectionState(chatId, lineUserId);
  return getCollectingMemberUpdateText({
    type: action === "join" ? "joined" : "left",
    actorName: displayName,
    memberNames: result.participants.map((participant) => participant.displayName)
  });
}

async function openJoinLeaveFlow(event: LineMessageEvent) {
  const { chatType, chatId, lineUserId } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const active = await getActiveLedgerParticipants(binding.group.id);

  if (!active.ledger) {
    return getNoActiveJoinLeaveLedgerText();
  }

  activateJoinLeaveSelectionState(chatId, lineUserId);

  const memberLine =
    active.participants.length > 0
      ? active.participants.map((participant) => participant.displayName).join("、")
      : "目前尚未有成員";

  return [
    `目前活動：${active.ledger.name}`,
    "",
    "請輸入：",
    "+ 加入活動",
    "- 退出活動",
    "",
    "目前成員：",
    memberLine
  ].join("\n");
}

async function handleConfirmMembers(event: LineMessageEvent) {
  const { chatId, chatType, lineUserId } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const activeLedger = await getActiveLedger(binding.group.id);

  if (!activeLedger) {
    return getNoActiveLedgerText();
  }

  if (activeLedger.creatorLineUserId && lineUserId && activeLedger.creatorLineUserId !== lineUserId) {
    return "只有本次活動建立者可以確認成員";
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
  const { chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const active = await getActiveLedgerParticipants(binding.group.id);

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

async function handleCurrentLedger(event: LineMessageEvent) {
  const { chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const activeLedger = await getActiveLedger(binding.group.id);

  if (!activeLedger) {
    return getNoActiveLedgerText();
  }

  return `目前活動：${activeLedger.name}`;
}

async function handleResetLedger(event: LineMessageEvent) {
  const { chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const closed = await closeActiveLedger(binding.group.id);

  if (!closed) {
    return getNoActiveLedgerText();
  }

  return `已結束目前活動：${closed.name}`;
}

async function handleGroupInfo(event: LineMessageEvent) {
  const { chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const summary = await getGroupInfoSummary(binding.group.id);

  if (!summary) {
    return getMissingGroupContextMessage();
  }

  return [
    `群組：${summary.name}`,
    `建立時間：${summary.createdAt.toLocaleString("zh-TW")}`,
    summary.activeLedgerName ? `目前活動：${summary.activeLedgerName}` : "目前活動：沒有"
  ].join("\n");
}

async function handleSwitchLedger(event: LineMessageEvent, name: string) {
  const { chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  try {
    const result = await switchActiveLedger(binding.group.id, name);

    return result.previousActiveName
      ? `已切換到活動：${result.ledger.name}\n上一個活動：${result.previousActiveName}`
      : `已切換到活動：${result.ledger.name}`;
  } catch (error) {
    return error instanceof Error ? error.message : "切換活動時發生錯誤。";
  }
}

async function handleListLedgers(event: LineMessageEvent) {
  const { chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const ledgers = await listLedgers(binding.group.id);
  return getLedgerListText(
    ledgers.map((ledger) => ({
      name: ledger.name,
      isActive: ledger.isActive,
      status: ledger.status
    }))
  );
}

async function handleSettlement(event: LineMessageEvent) {
  const { chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const snapshot = await getSettlementSnapshot(binding.group.id);

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

async function handleCurrentSettlement(event: LineMessageEvent) {
  const { chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const snapshot = await getSettlementSnapshot(binding.group.id);

  if (!snapshot?.activeLedger) {
    return getNoActiveLedgerText();
  }

  if (!snapshot.summary.settlement.length) {
    return getNoFormalSettlementText();
  }

  return buildSettlementBlock(
    snapshot.summary.settlement.map(
      (item) => `${item.fromName} → ${item.toName} ${item.amountDisplay}`
    )
  );
}

async function handleMvp(event: LineMessageEvent) {
  const { chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const snapshot = await getActiveLedgerExpenseMvp(binding.group.id);

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

async function handleArchivedLedgers(event: LineMessageEvent) {
  const { chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const ledgers = await getArchivedLedgerSnapshots(binding.group.id, 5);

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

function resolvePayerParticipant(input: {
  participants: ConfirmedParticipantRef[];
  actorDisplayName: string;
  payerName?: string | null;
  payerIsSender?: boolean;
  lineUserId?: string;
}) {
  if (input.payerIsSender || !input.payerName) {
    const byLineUserId = input.lineUserId
      ? input.participants.find((participant) => participant.lineUserId === input.lineUserId)
      : null;

    if (byLineUserId) {
      return byLineUserId;
    }

    const byDisplayName = findParticipantByName(input.participants, input.actorDisplayName);
    if (byDisplayName) {
      return byDisplayName;
    }

    return null;
  }

  return findParticipantByName(input.participants, input.payerName);
}

function resolveCustomShares(input: {
  participants: ConfirmedParticipantRef[];
  shares: Array<{ participantName: string; amount: string }>;
}) {
  const resolved: Array<{ memberId: string; memberName: string; shareCents: number }> = [];

  for (const share of input.shares) {
    const participant = findParticipantByName(input.participants, share.participantName);

    if (!participant) {
      return {
        ok: false as const,
        missingParticipantName: share.participantName
      };
    }

    resolved.push({
      memberId: participant.memberId,
      memberName: participant.displayName,
      shareCents: parseAmountToCents(share.amount)
    });
  }

  return {
    ok: true as const,
    shares: resolved
  };
}

async function buildCurrentSettlementText(groupId: string) {
  const snapshot = await getSettlementSnapshot(groupId);

  if (!snapshot?.activeLedger) {
    return getNoActiveLedgerText();
  }

  if (!snapshot.summary.settlement.length) {
    return getNoFormalSettlementText();
  }

  return buildSettlementBlock(
    snapshot.summary.settlement.map(
      (item) => `${item.fromName} → ${item.toName} ${item.amountDisplay}`
    )
  );
}

async function keepContinuousExpenseModeActive(input: {
  groupId: string;
  chatId: string;
  requesterLineUserId: string;
  payload?: Prisma.InputJsonValue | null;
}) {
  await createPendingAction({
    groupId: input.groupId,
    chatId: input.chatId,
    requesterLineUserId: input.requesterLineUserId,
    actionType: AWAITING_EXPENSE_DETAILS_ACTION,
    payload: input.payload ?? null,
    ttlMinutes: 10
  });
}

function describeExpenseLineFailure(line: string) {
  const normalized = line.trim();

  if (!normalized) {
    return null;
  }

  if (isUrlLikeText(normalized)) {
    return "看起來像網址";
  }

  if (normalized.length > 100) {
    return "內容過長";
  }

  if (!/\d/.test(normalized)) {
    return "缺少金額";
  }

  if (!/付/.test(normalized)) {
    return "缺少付款人";
  }

  return "格式不正確";
}

async function createEqualExpenseEntry(input: {
  event: LineMessageEvent;
  title: string;
  amount: string;
  payerName?: string;
  payerIsSender?: boolean;
}) {
  const { chatType, lineUserId } = getChatContext(input.event.source);

  if (chatType === "user") {
    return {
      ok: false as const,
      message: getGroupOnlyMessage()
    };
  }

  const binding = await getOrCreateGroupContext(input.event.source);
  if (!binding) {
    return {
      ok: false as const,
      message: getMissingGroupContextMessage()
    };
  }

  const confirmed = await getConfirmedMemberIdsForActiveLedger(binding.group.id);

  if (!confirmed.ledger) {
    return {
      ok: false as const,
      message: getNoActiveLedgerText()
    };
  }

  if (confirmed.ledger.isCollectingMembers) {
    return {
      ok: false as const,
      message: getExpenseNotAllowedText()
    };
  }

  const actorDisplayName = await resolveActorDisplayName(input.event);
  const payer = resolvePayerParticipant({
    participants: confirmed.participants,
    actorDisplayName,
    payerName: input.payerName,
    payerIsSender: input.payerIsSender,
    lineUserId
  });

  if (!payer) {
    return {
      ok: false as const,
      message: getMissingPayerText(input.payerName ?? actorDisplayName)
    };
  }

  const created = await createExpenseInGroup({
    groupId: binding.group.id,
    title: input.title,
    amount: input.amount,
    payerId: payer.memberId,
    participantIds: confirmed.memberIds
  });

  const amountCents = parseAmountToCents(input.amount);
  const shareCents =
    created.expense.participants[0]?.shareCents ??
    Math.round(amountCents / confirmed.memberIds.length);

  return {
    ok: true as const,
    groupId: binding.group.id,
    title: input.title,
    amountCents,
    payerDisplayName: payer.displayName,
    participantCount: created.expense.participants.length,
    shareCents
  };
}

async function createAndFormatEqualExpense(input: {
  event: LineMessageEvent;
  title: string;
  amount: string;
  payerName?: string;
  payerIsSender?: boolean;
}) {
  const created = await createEqualExpenseEntry(input);

  if (!created.ok) {
    return created.message;
  }

  const settlementText = await buildCurrentSettlementText(created.groupId);

  return [
    `已新增支出：${input.title} ${formatAmountForDisplay(created.amountCents)}`,
    "",
    `付款人：${created.payerDisplayName}`,
    `平均分攤：${created.participantCount}人，每人${formatAmountForDisplay(created.shareCents)}`,
    "",
    settlementText
  ].join("\n");
}

async function finalizeEqualExpense(input: {
  event: LineMessageEvent;
  title: string;
  amount: string;
  payerName?: string;
  payerIsSender?: boolean;
}) {
  const { chatType, lineUserId } = getChatContext(input.event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getOrCreateGroupContext(input.event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const confirmed = await getConfirmedMemberIdsForActiveLedger(binding.group.id);

  if (!confirmed.ledger) {
    return getNoActiveLedgerText();
  }

  if (confirmed.ledger.isCollectingMembers) {
    return getExpenseNotAllowedText();
  }

  const actorDisplayName = await resolveActorDisplayName(input.event);
  const payer = resolvePayerParticipant({
    participants: confirmed.participants,
    actorDisplayName,
    payerName: input.payerName,
    payerIsSender: input.payerIsSender,
    lineUserId
  });

  if (!payer) {
    return getMissingPayerText(input.payerName ?? actorDisplayName);
  }

  const created = await createExpenseInGroup({
    groupId: binding.group.id,
    title: input.title,
    amount: input.amount,
    payerId: payer.memberId,
    participantIds: confirmed.memberIds
  });

  const amountCents = parseAmountToCents(input.amount);
  const shareCents = Math.round(amountCents / confirmed.memberIds.length);
  const snapshot = await getSettlementSnapshot(binding.group.id);

  const settlementLines =
    snapshot?.summary.settlement.map(
      (item) => `${item.fromName} → ${item.toName} ${item.amountDisplay}`
    ) ?? ["目前已經結清，不用再轉帳了。"];

  return [
    `已新增支出：${input.title} ${formatAmountForDisplay(amountCents)}`,
    "",
    `付款人：${payer.displayName}`,
    `平均分攤：${confirmed.memberIds.length}人，每人${formatAmountForDisplay(shareCents)}`,
    "",
    buildSettlementBlock(settlementLines)
  ].join("\n");
}

async function finalizeCustomExpense(input: {
  event: LineMessageEvent;
  draft: PendingExpenseDraft;
}) {
  const { chatType, lineUserId } = getChatContext(input.event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getOrCreateGroupContext(input.event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const confirmed = await getConfirmedMemberIdsForActiveLedger(binding.group.id);

  if (!confirmed.ledger) {
    return getNoActiveLedgerText();
  }

  if (confirmed.ledger.isCollectingMembers) {
    return getExpenseNotAllowedText();
  }

  const actorDisplayName = await resolveActorDisplayName(input.event);
  const payer = resolvePayerParticipant({
    participants: confirmed.participants,
    actorDisplayName,
    payerName: input.draft.payerName,
    payerIsSender: input.draft.payerIsSender,
    lineUserId
  });

  if (!payer) {
    return getMissingPayerText(input.draft.payerName ?? actorDisplayName);
  }

  const resolvedShares = resolveCustomShares({
    participants: confirmed.participants,
    shares: input.draft.shares
  });

  if (!resolvedShares.ok) {
    return getMissingParticipantText(resolvedShares.missingParticipantName);
  }

  const totalCents = parseAmountToCents(input.draft.amount);
  const shareTotalCents = resolvedShares.shares.reduce((sum, share) => sum + share.shareCents, 0);

  if (shareTotalCents !== totalCents) {
    return buildExpenseMismatchText(totalCents, shareTotalCents);
  }

  await createExpenseInGroup({
    groupId: binding.group.id,
    title: input.draft.title,
    amount: input.draft.amount,
    payerId: payer.memberId,
    participantShares: resolvedShares.shares.map((share) => ({
      memberId: share.memberId,
      shareCents: share.shareCents
    }))
  });

  const snapshot = await getSettlementSnapshot(binding.group.id);
  const settlementLines =
    snapshot?.summary.settlement.map(
      (item) => `${item.fromName} → ${item.toName} ${item.amountDisplay}`
    ) ?? ["目前已經結清，不用再轉帳了。"];

  return [
    `已新增支出：${input.draft.title} ${formatAmountForDisplay(totalCents)}`,
    "",
    `付款人：${payer.displayName}`,
    ...resolvedShares.shares.map(
      (share) => `${share.memberName}：${formatAmountForDisplay(share.shareCents)}`
    ),
    "",
    buildSettlementBlock(settlementLines)
  ].join("\n");
}

async function handleImmediateMultilineExpense(event: LineMessageEvent) {
  const lines = splitMultilineSegments(event.message.text);

  if (lines.length < 3) {
    return null;
  }

  const header = parseExpenseDraftHeader(lines[0]);
  const payerLine = parseExpensePayerLine(lines[1]);

  if (!header || !payerLine) {
    return null;
  }

  const shares = lines.slice(2).map(parseExpenseShareLine);
  if (shares.some((share) => !share)) {
    return null;
  }

  return finalizeCustomExpense({
    event,
    draft: {
      title: header.title,
      amount: header.amount,
      payerName: payerLine.payerName,
      payerIsSender: payerLine.payerIsSender,
      shares: shares.filter(
        (
          share
        ): share is {
          participantName: string;
          amount: string;
        } => Boolean(share)
      )
    }
  });
}

async function handleBatchEqualExpenses(event: LineMessageEvent) {
  const lines = splitMultilineSegments(event.message.text);

  if (lines.length === 0) {
    return null;
  }

  const successes: Array<{
    title: string;
    amountCents: number;
    payerDisplayName: string;
  }> = [];
  const failures: string[] = [];
  let groupId: string | null = null;

  for (const line of lines) {
    const explicitExpense = parseExplicitExpenseWhileAwaiting(line);

    if (!explicitExpense) {
      const reason = describeExpenseLineFailure(line) ?? "格式不正確";
      failures.push(`- ${line}：${reason}`);
      continue;
    }

    const created = await createEqualExpenseEntry({
      event,
      title: explicitExpense.title,
      amount: explicitExpense.amount,
      payerName: explicitExpense.payerName,
      payerIsSender: explicitExpense.payerIsSender
    });

    if (!created.ok) {
      if (successes.length === 0) {
        return created.message;
      }

      failures.push(`- ${line}：${created.message}`);
      continue;
    }

    groupId = created.groupId;
    successes.push({
      title: created.title,
      amountCents: created.amountCents,
      payerDisplayName: created.payerDisplayName
    });
  }

  if (successes.length === 0) {
    return failures.length > 0 ? [getContinuousExpenseInvalidPrompt(), "", ...failures].join("\n") : null;
  }

  if (successes.length === 1 && failures.length === 0 && groupId) {
    const settlementText = await buildCurrentSettlementText(groupId);
    return [
      getContinuousExpenseSavedPrompt(1),
      "",
      settlementText
    ].join("\n");
  }

  const linesForReply: string[] = [
    `已新增 ${successes.length} 筆支出：`,
    "",
    ...successes.map(
      (item, index) =>
        `${index + 1}. ${item.title} ${formatAmountForDisplay(item.amountCents)}｜${item.payerDisplayName}付`
    )
  ];

  if (failures.length > 0) {
    linesForReply.push(
      "",
      "以下項目未新增，請確認格式：",
      "",
      ...failures,
      "",
      "請重新輸入錯誤的項目，或輸入【完成】結束。"
    );
  } else if (groupId) {
    const settlementText = await buildCurrentSettlementText(groupId);
    linesForReply.push("", settlementText, "", getContinuousExpenseContinuePrompt());
  }

  return linesForReply.join("\n");
}

async function handleExpenseDraftStart(event: LineMessageEvent) {
  const { chatType, chatId, lineUserId } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  if (!lineUserId) {
    return getMissingLineIdentityMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const confirmed = await getConfirmedMemberIdsForActiveLedger(binding.group.id);
  if (!confirmed.ledger) {
    return getNoActiveLedgerText();
  }

  if (confirmed.ledger.isCollectingMembers) {
    return getExpenseNotAllowedText();
  }

  const header = parseExpenseDraftHeader(event.message.text.trim());
  if (!header) {
    return null;
  }

  await createPendingAction({
    groupId: binding.group.id,
    chatId,
    requesterLineUserId: lineUserId,
    actionType: AWAITING_EXPENSE_DETAILS_ACTION,
    payload: serializeExpenseDraftPayload(buildExpenseDraft(header.title, header.amount)),
    ttlMinutes: 10
  });

  return `已記下：${header.title} ${header.amount}\n請再輸入付款人，例如：小明付`;
}

async function startAwaitingExpenseInput(event: LineMessageEvent) {
  const { chatType, chatId, lineUserId } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  if (!lineUserId) {
    return getMissingLineIdentityMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const confirmed = await getConfirmedMemberIdsForActiveLedger(binding.group.id);
  if (!confirmed.ledger) {
    return getNoActiveLedgerText();
  }

  if (confirmed.ledger.isCollectingMembers) {
    return getExpenseNotAllowedText();
  }

  await createPendingAction({
    groupId: binding.group.id,
    chatId,
    requesterLineUserId: lineUserId,
    actionType: AWAITING_EXPENSE_DETAILS_ACTION,
    payload: null,
    ttlMinutes: 10
  });

  return withQuickReply(getContinuousExpensePrompt(), buildExpenseQuickReply());
}

async function handleExpenseDraftContinuation(
  event: LineMessageEvent,
  pending: Awaited<ReturnType<typeof getPendingActionState>>["pending"]
) {
  const { chatId, lineUserId, chatType } = getChatContext(event.source);

  if (!pending || !lineUserId || chatType === "user") {
    return getAwaitingExpenseExpiredPrompt();
  }

  const draft = parseExpenseDraftPayload(pending.payload);
  if (!draft) {
    await clearPendingAction({
      chatId,
      requesterLineUserId: lineUserId,
      actionType: AWAITING_EXPENSE_DETAILS_ACTION
    });
    return getAwaitingExpenseExpiredPrompt();
  }

  const updatedDraft: PendingExpenseDraft = {
    ...draft,
    shares: [...draft.shares]
  };

  const lines = splitMultilineSegments(event.message.text);
  let changed = false;

  for (const line of lines) {
    const payer = parseExpensePayerLine(line);
    if (payer) {
      updatedDraft.payerName = payer.payerName;
      updatedDraft.payerIsSender = payer.payerIsSender;
      changed = true;
      continue;
    }

    const share = parseExpenseShareLine(line);
    if (share) {
      updatedDraft.shares.push(share);
      changed = true;
    }
  }

  if (!changed) {
    return "看不懂這段支出細項，請改成像「小明付」或「100小華」這樣的格式。";
  }

  const totalCents = parseAmountToCents(updatedDraft.amount);
  const shareTotalCents = updatedDraft.shares.reduce(
    (sum, share) => sum + parseAmountToCents(share.amount),
    0
  );

  if (shareTotalCents > totalCents) {
    await keepContinuousExpenseModeActive({
      groupId: pending.groupId,
      chatId,
      requesterLineUserId: lineUserId,
      payload: null
    });
    return [buildExpenseMismatchText(totalCents, shareTotalCents), "", getContinuousExpenseContinuePrompt()].join("\n");
  }

  if (updatedDraft.payerName && shareTotalCents === totalCents) {
    const reply = await finalizeCustomExpense({
      event,
      draft: updatedDraft
    });
    await keepContinuousExpenseModeActive({
      groupId: pending.groupId,
      chatId,
      requesterLineUserId: lineUserId,
      payload: null
    });
    return [reply, "", getContinuousExpenseContinuePrompt()].join("\n");
  }

  await keepContinuousExpenseModeActive({
    groupId: pending.groupId,
    chatId,
    requesterLineUserId: lineUserId,
    payload: serializeExpenseDraftPayload(updatedDraft)
  });

  if (!updatedDraft.payerName) {
    return `已記下：${updatedDraft.title} ${updatedDraft.amount}\n請再輸入付款人，例如：小明付`;
  }

  return `目前細項加總：${formatAmountForDisplay(shareTotalCents)} / ${formatAmountForDisplay(totalCents)}\n請繼續輸入下一位，例如：50小美`;
}

async function handleRecentExpenses(event: LineMessageEvent) {
  const { chatType } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const result = await getRecentExpenses(binding.group.id, 5);

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
    ].join("\n\n"),
    buildExpenseQuickReply()
  );
}

async function handleDeleteLastExpense(event: LineMessageEvent) {
  const { chatType, chatId, lineUserId } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  if (!lineUserId) {
    return getMissingLineIdentityMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const result = await getRecentExpenses(binding.group.id, 1);
  const latestExpense = result.expenses[0];

  if (!latestExpense) {
    return "目前沒有可刪除的紀錄";
  }

  await createPendingAction({
    groupId: binding.group.id,
    chatId,
    requesterLineUserId: lineUserId,
    actionType: PendingActionType.delete_recent_expense,
    targetExpenseId: latestExpense.id,
    ttlMinutes: 5
  });

  return "確定要刪除上一筆支出嗎？請回覆 是 或 否";
}

async function handleArchivePrompt(event: LineMessageEvent) {
  const { chatType, chatId, lineUserId } = getChatContext(event.source);

  if (chatType === "user") {
    return getGroupOnlyMessage();
  }

  if (!lineUserId) {
    return getMissingLineIdentityMessage();
  }

  const binding = await getOrCreateGroupContext(event.source);
  if (!binding) {
    return getMissingGroupContextMessage();
  }

  const activeLedger = await getActiveLedger(binding.group.id);

  if (!activeLedger) {
    return getNoActiveLedgerText();
  }

  await createPendingAction({
    groupId: binding.group.id,
    chatId,
    requesterLineUserId: lineUserId,
    actionType: PendingActionType.archive_active_ledger,
    targetLedgerId: activeLedger.id,
    ttlMinutes: 5
  });

  return [
    "提醒大人：請先確認本次費用是否都已結清。",
    "確定要結束並封存這次活動嗎？",
    "請回覆 是 或 否"
  ].join("\n");
}

async function handlePendingConfirmation(event: LineMessageEvent, confirmed: boolean) {
  const { chatId, chatType, lineUserId } = getChatContext(event.source);

  if (chatType === "user" || !lineUserId) {
    return confirmed ? null : null;
  }

  const pending = await getPendingAction({
    chatId,
    requesterLineUserId: lineUserId
  });

  if (!pending) {
    return null;
  }

  await clearPendingAction({
    chatId,
    requesterLineUserId: lineUserId
  });

  if (!confirmed) {
    if (pending.actionType === PendingActionType.delete_recent_expense) {
      return "已取消刪除上一筆支出";
    }

    if (pending.actionType === PendingActionType.archive_active_ledger) {
      return "已取消封存活動";
    }

    return null;
  }

  if (pending.actionType === PendingActionType.delete_recent_expense) {
    if (!pending.targetExpenseId) {
      return "目前沒有可刪除的紀錄";
    }

    const expense = await db.expense.findUnique({
      where: { id: pending.targetExpenseId },
      include: {
        participants: true
      }
    });

    if (!expense) {
      return "目前沒有可刪除的紀錄";
    }

    await db.expense.delete({
      where: { id: expense.id }
    });

    const snapshot = await getSettlementSnapshot(pending.groupId);
    const settlementLines =
      snapshot?.summary.settlement.map(
        (item) => `${item.fromName} → ${item.toName} ${item.amountDisplay}`
      ) ?? ["目前已經結清，不用再轉帳了。"];

    return [
      `已刪除：${expense.title} ${formatAmountForDisplay(expense.amountCents)}`,
      "",
      buildSettlementBlock(settlementLines)
    ].join("\n");
  }

  if (pending.actionType === PendingActionType.archive_active_ledger) {
    const activeLedger = await getActiveLedger(pending.groupId);

    if (!activeLedger) {
      return getNoActiveLedgerText();
    }

    if (activeLedger.creatorLineUserId && activeLedger.creatorLineUserId !== lineUserId) {
      return "只有本次活動建立者可以確認封存";
    }

    const archived = await archiveActiveLedger(pending.groupId);

    if (!archived) {
      return getNoActiveLedgerText();
    }

    return `已結束並封存活動：${archived.name}`;
  }

  return null;
}

async function handlePaymentSetupResponse(lineUserId: string, text: string) {
  const profile = await getOrCreateLineUserProfile(lineUserId);
  const step = profile.setupState as PaymentSetupStep | null;

  if (!step) {
    return null;
  }

  const normalized = text.trim();
  const draft = getCurrentPaymentDraft(profile);

  if (normalized === "取消") {
    await updateLineUserProfileDraft(lineUserId, null, null);
    return "已取消設定。";
  }

  if (step === PAYMENT_SETUP_STEPS.awaitingMethodChoice) {
    const selection = parsePaymentSelectionInput(normalized);

    if (!selection.ok) {
      return getPaymentSelectionInvalidText();
    }

    const selectedRequiringInput = selection.selections.filter(
      (value) => value === 1 || value === 4 || value === 5
    );

    const nextDraft = defaultPaymentSetupDraft({
      ...draft,
      acceptLinePay: draft.acceptLinePay || selection.selections.includes(2),
      acceptCash: draft.acceptCash || selection.selections.includes(3),
      bankName:
        draft.acceptCash || selection.selections.includes(3)
          ? draft.bankName ?? "Cash"
          : draft.bankName,
      pendingSelections: selectedRequiringInput
    });

    return continuePaymentSetup(lineUserId, nextDraft);
  }

  if (step === PAYMENT_SETUP_STEPS.awaitingBankInfo) {
    if (!normalized.includes("/")) {
      return getBankAccountInvalidPrompt();
    }

    const nextDraft = defaultPaymentSetupDraft({
      ...draft,
      acceptBankTransfer: true,
      bankName: "銀行帳戶",
      bankAccount: normalized,
    });

    return continuePaymentSetup(lineUserId, nextDraft);
  }

  if (step === PAYMENT_SETUP_STEPS.awaitingOtherMethod) {
    const nextDraft = defaultPaymentSetupDraft({
      ...draft,
      acceptBankTransfer: true,
      bankName: "Other",
      bankAccount: normalized,
    });

    return continuePaymentSetup(lineUserId, nextDraft);
  }

  if (step === PAYMENT_SETUP_STEPS.awaitingNote) {
    const nextDraft = defaultPaymentSetupDraft({
      ...draft,
      paymentNote: normalized
    });

    return continuePaymentSetup(lineUserId, nextDraft);
  }

  return null;
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
    if (chatType === "user" && number === 4) {
      return { kind: "start-payment-setup" };
    }

    return { kind: "ignored" };
  }

  if (menuMode === "xiaoer") {
    if (number === 1) {
      return trimmedPayload ? { kind: "create-ledger", name: trimmedPayload } : { kind: "create-ledger-help" };
    }

    if (number === 2) {
      return { kind: "join-activity" };
    }

    if (number === 3) {
      return { kind: "confirm-members" };
    }

    if (number === 4) {
      return { kind: "start-payment-setup" };
    }

    if (number === 5) {
      return { kind: "expense-help" };
    }

    if (number === 6) {
      return { kind: "recent-expenses" };
    }

    if (number === 7) {
      return { kind: "delete-last-expense" };
    }
  }

  if (menuMode === "settlement") {
    if (number === 1) {
      return { kind: "current-settlement" };
    }

    if (number === 2) {
      return { kind: "settlement" };
    }

    if (number === 3) {
      return { kind: "mvp" };
    }

    if (number === 4) {
      return { kind: "list-archived-ledgers" };
    }

    if (number === 5) {
      return { kind: "close-ledger" };
    }
  }

  return { kind: "ignored" };
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
        const binding = chatType !== "user" ? await getOrCreateGroupContext(event.source) : null;
        await rememberMenuContext({
          chatId,
          lineUserId,
          groupId: binding?.group.id ?? null,
          mode: "xiaoer"
        });
      }
      return withQuickReply(getXiaoerMenuText(), buildAssistantQuickReply());

    case "settlement-help":
      if (lineUserId) {
        const binding = chatType !== "user" ? await getOrCreateGroupContext(event.source) : null;
        await rememberMenuContext({
          chatId,
          lineUserId,
          groupId: binding?.group.id ?? null,
          mode: "settlement"
        });
      }
      return withQuickReply(getSettlementMenuText(), buildSettlementQuickReply());

    case "create-ledger-help":
      if (chatType === "user") {
        return getGroupOnlyMessage();
      }

      return (async () => {
        const binding = await getOrCreateGroupContext(event.source);
        if (!binding) {
          return getMissingGroupContextMessage();
        }

        return startAwaitingActivityName({
          groupId: binding.group.id,
          chatId,
          lineUserId
        });
      })();

    case "create-ledger":
      if (!command.name) {
        if (chatType === "user") {
          return getGroupOnlyMessage();
        }

        const binding = await getOrCreateGroupContext(event.source);
        if (!binding) {
          return getMissingGroupContextMessage();
        }

        return startAwaitingActivityName({
          groupId: binding.group.id,
          chatId,
          lineUserId
        });
      }

      return handleCreateLedgerCommand(event, command.name);

    case "join-activity":
      return openJoinLeaveFlow(event);

    case "leave-activity":
      return openJoinLeaveFlow(event);

    case "confirm-members":
      return handleConfirmMembers(event);

    case "list-members":
      return handleListMembers(event);

    case "current-ledger":
      return handleCurrentLedger(event);

    case "current-settlement":
      return handleCurrentSettlement(event);

    case "reset-ledger":
      return handleResetLedger(event);

    case "group-info":
      return handleGroupInfo(event);

    case "switch-ledger":
      return handleSwitchLedger(event, command.name);

    case "list-ledgers":
      return handleListLedgers(event);

    case "expense-help":
      if (command.useLegacyAlias ?? false) {
        return withQuickReply(
          getExpenseGuideText(true),
          buildExpenseQuickReply()
        );
      }

      return startAwaitingExpenseInput(event);

    case "recent-expenses":
      return handleRecentExpenses(event);

    case "delete-last-expense":
      return handleDeleteLastExpense(event);

    case "settlement":
      return handleSettlement(event);

    case "mvp":
      return handleMvp(event);

    case "close-ledger":
      return handleArchivePrompt(event);

    case "archive-ledger": {
      const { chatType: innerChatType } = getChatContext(event.source);
      if (innerChatType === "user") {
        return getGroupOnlyMessage();
      }

      const binding = await getOrCreateGroupContext(event.source);
      if (!binding) {
        return getMissingGroupContextMessage();
      }

      try {
        const archived = await archiveLedger(binding.group.id, command.name);
        return `已封存活動：${archived.name}`;
      } catch (error) {
        return error instanceof Error ? error.message : "封存活動時發生錯誤。";
      }
    }

    case "list-archived-ledgers":
      return handleArchivedLedgers(event);

    case "start-payment-setup": {
      if (chatType !== "user") {
        return getPaymentSetupGuideText();
      }

      if (!lineUserId) {
        return getMissingLineIdentityMessage();
      }

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

      await updateLineUserProfileDraft(
        lineUserId,
        PAYMENT_SETUP_STEPS.awaitingMethodChoice,
        draft
      );

      return getPaymentSetupMenuText();
    }

    case "identify-self": {
      if (chatType !== "user") {
        return "請私訊我使用這個功能。";
      }

      if (!lineUserId) {
        return getMissingLineIdentityMessage();
      }

      await db.lineUserProfile.upsert({
        where: { lineUserId },
        update: {
          memberName: command.name
        },
        create: {
          lineUserId,
          memberName: command.name
        }
      });

      return `好，之後我就記得你是 ${command.name}。`;
    }

    case "create-group":
    case "bind":
      return "現在不需要手動綁定群組，直接用「建立活動」就可以開始。";

    case "expense":
      return createAndFormatEqualExpense({
        event,
        title: command.title,
        amount: command.amount,
        payerName: command.payerName,
        payerIsSender: command.payerIsSender
      });

    default:
      console.error(`Command recognized but no handler found: ${command.kind}`);
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
  const parsed = mapGroupFallbackCommand(rawText, parseLineCommand(event.message.text));

  if (lineUserId) {
    const pendingActivityState = await getPendingActionState({
      chatId,
      requesterLineUserId: lineUserId,
      actionType: AWAITING_ACTIVITY_NAME_ACTION
    });

    if (pendingActivityState.pending) {
      if (parsed.kind === "cancel") {
        await clearPendingAction({
          chatId,
          requesterLineUserId: lineUserId,
          actionType: AWAITING_ACTIVITY_NAME_ACTION
        });

        return getAwaitingActivityCancelledPrompt();
      }

      if (parsed.kind === "ignored" && rawText) {
        return handleCreateLedgerFromPending(event, rawText);
      }
    } else if (pendingActivityState.expired && parsed.kind === "ignored" && rawText) {
      return getAwaitingActivityNameExpiredPrompt();
    }

    const pendingExpenseState = await getPendingActionState({
      chatId,
      requesterLineUserId: lineUserId,
      actionType: AWAITING_EXPENSE_DETAILS_ACTION
    });

    if (pendingExpenseState.pending) {
      if (parsed.kind === "cancel") {
        await clearPendingAction({
          chatId,
          requesterLineUserId: lineUserId,
          actionType: AWAITING_EXPENSE_DETAILS_ACTION
        });
        return getAwaitingExpenseCancelledPrompt();
      }

      if (isContinuousExpenseCompleteCommand(rawText)) {
        await clearPendingAction({
          chatId,
          requesterLineUserId: lineUserId,
          actionType: AWAITING_EXPENSE_DETAILS_ACTION
        });

        const binding = await getOrCreateGroupContext(event.source);
        if (!binding) {
          return getMissingGroupContextMessage();
        }

        const settlementText = await buildCurrentSettlementText(binding.group.id);
        return ["已結束新增支出。", "", settlementText].join("\n");
      }

      if (!pendingExpenseState.pending.payload) {
        const multilineExpenseReply = await handleImmediateMultilineExpense(event);
        if (multilineExpenseReply) {
          await keepContinuousExpenseModeActive({
            groupId: pendingExpenseState.pending.groupId,
            chatId,
            requesterLineUserId: lineUserId,
            payload: null
          });
          return [multilineExpenseReply, "", getContinuousExpenseContinuePrompt()].join("\n");
        }

        const batchExpenseReply = await handleBatchEqualExpenses(event);
        if (batchExpenseReply) {
          await keepContinuousExpenseModeActive({
            groupId: pendingExpenseState.pending.groupId,
            chatId,
            requesterLineUserId: lineUserId,
            payload: null
          });
          return batchExpenseReply;
        }

        return getContinuousExpenseInvalidPrompt();
      }

      if (
        parsed.kind !== "xiaoer-help" &&
        parsed.kind !== "settlement-help" &&
        parsed.kind !== "start-payment-setup" &&
        parsed.kind !== "confirm" &&
        parsed.kind !== "menu-context-required"
      ) {
        return handleExpenseDraftContinuation(event, pendingExpenseState.pending);
      }
    }
  }

  if (chatType !== "user" && (isJoinSelectionText(rawText) || isLeaveSelectionText(rawText))) {
    if (hasActiveJoinLeaveSelectionState(chatId, lineUserId)) {
      return handleJoinOrLeaveWithRoster(
        event,
        isJoinSelectionText(rawText) ? "join" : "leave"
      );
    }

    return null;
  }

  if (
    chatType !== "user" &&
    (parsed.kind === "join-activity" || parsed.kind === "leave-activity") &&
    rawText !== "加入活動"
  ) {
    return null;
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

  if (chatType !== "user") {
    if (parsed.kind === "ignored") {
      return null;
    }

    if (parsed.kind === "expense") {
      return null;
    }

    if (!isGroupWhitelistedCommand(parsed)) {
      return null;
    }
  }

  return handleResolvedCommand(event, parsed);
}

async function handleJoinLikeEvent(event: LineJoinLikeEvent) {
  if (event.source.type === "group" || event.source.type === "room") {
    await getOrCreateGroupContext(event.source);
    return getWelcomeJoinMessage();
  }

  return "你好，我是小二，之後可以把我拉進群組一起記帳。";
}

export async function handleLineEvent(
  event: LineEvent,
  _appBaseUrl: string
): Promise<LineTextReplyPayload | null> {
  if (event.type === "message" && event.message.type === "text") {
    return handleMessageEvent(event);
  }

  if (event.type === "join" || event.type === "follow") {
    return handleJoinLikeEvent(event);
  }

  return null;
}
