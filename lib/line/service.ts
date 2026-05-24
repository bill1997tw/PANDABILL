import { Prisma } from "@prisma/client";

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
import {
  looksLikeExpenseInput,
  parseExpenseBlock,
  splitExpenseBlocks,
  type ParsedExpenseBlock
} from "@/lib/commands/expense";
import {
  getExpenseGuideText,
  getPaymentSetupGuideText,
  getXiaoerMenuText
} from "@/lib/commands/help";
import { formatCents, parseAmountToCents } from "@/lib/currency";
import { db } from "@/lib/db";
import {
  createExpenseInGroup,
  getConfirmedMemberIdsForActiveLedger,
  getMembersMissingPaymentMethod,
  getOrCreateGroupContext,
  getRecentExpenses,
  getSettlementSnapshot
} from "@/lib/group-service";
import {
  addMembersToCollectingLedger,
  confirmCollectingLedger,
  createLedgerForGroup,
  getActiveLedger,
  getActiveLedgerParticipants,
  joinCollectingLedger,
  leaveCollectingLedger,
  removeMemberFromCollectingLedger
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
import type { LineTextReplyPayload } from "@/lib/line/client";
import type { LineEvent, LineJoinLikeEvent, LineMessageEvent } from "@/lib/line/types";

const deleteExpenseState = new Map<string, number>();
const DELETE_EXPENSE_TTL_MS = 5 * 60 * 1000;

type ChatContext = {
  chatId: string;
  chatType: "group" | "room" | "user";
  lineUserId?: string;
};

type ParticipantRef = Awaited<
  ReturnType<typeof getConfirmedMemberIdsForActiveLedger>
>["participants"][number];

type ResolvedMember =
  | {
      ok: true;
      member: ParticipantRef;
    }
  | {
      ok: false;
      reason: string;
    };

function getChatContext(source: LineEvent["source"]): ChatContext {
  if (source.type === "group" && source.groupId) {
    return {
      chatId: source.groupId,
      chatType: "group",
      lineUserId: source.userId
    };
  }

  if (source.type === "room" && source.roomId) {
    return {
      chatId: source.roomId,
      chatType: "room",
      lineUserId: source.userId
    };
  }

  return {
    chatId: source.userId ?? "user",
    chatType: "user",
    lineUserId: source.userId
  };
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/gu, "").toLowerCase();
}

function isUrlLikeText(text: string) {
  return /https?:\/\//iu.test(text);
}

function formatAmountForDisplay(cents: number) {
  return cents % 100 === 0 ? String(cents / 100) : formatCents(cents);
}

function formatMemberList(names: string[]) {
  return names.length > 0 ? names.join("、") : "目前尚未有成員";
}

function formatParticipantNames(participants: Array<{ displayName: string }>) {
  return participants.map((participant) => participant.displayName);
}

function getNoActiveLedgerText() {
  return "目前沒有進行中的活動。\n請先輸入：建立活動 活動名稱";
}

function buildSettlementText(lines: string[]) {
  return [
    "目前結算：",
    "",
    ...(lines.length > 0 ? lines : ["目前沒有需要互相轉帳的款項。"])
  ].join("\n");
}

function buildSettlementLines(snapshot: Awaited<ReturnType<typeof getSettlementSnapshot>>) {
  if (!snapshot?.activeLedger || snapshot.summary.settlement.length === 0) {
    return ["目前沒有需要互相轉帳的款項。"];
  }

  return snapshot.summary.settlement.map(
    (item) => `${item.fromName} → ${item.toName} ${item.amountDisplay}`
  );
}

function deleteStateKey(chatId: string, lineUserId?: string) {
  return `${chatId}:${lineUserId ?? "unknown"}`;
}

function setDeleteExpenseState(chatId: string, lineUserId?: string) {
  deleteExpenseState.set(deleteStateKey(chatId, lineUserId), Date.now() + DELETE_EXPENSE_TTL_MS);
}

function clearDeleteExpenseState(chatId: string, lineUserId?: string) {
  deleteExpenseState.delete(deleteStateKey(chatId, lineUserId));
}

function hasDeleteExpenseState(chatId: string, lineUserId?: string) {
  const key = deleteStateKey(chatId, lineUserId);
  const expiresAt = deleteExpenseState.get(key);

  if (!expiresAt) {
    return false;
  }

  if (expiresAt < Date.now()) {
    deleteExpenseState.delete(key);
    return false;
  }

  return true;
}

async function resolveActorDisplayName(event: LineMessageEvent) {
  const displayName = await getLineDisplayName(event.source);
  return displayName?.trim() || "使用者";
}

async function getGroupIdOrReply(event: LineMessageEvent) {
  const binding = await getOrCreateGroupContext(event.source);

  if (!binding) {
    return {
      ok: false as const,
      reply: "小二暫時連線不穩，請稍後再試。"
    };
  }

  return {
    ok: true as const,
    groupId: binding.group.id
  };
}

async function handleCreateLedger(event: LineMessageEvent, name: string) {
  const { lineUserId } = getChatContext(event.source);
  const group = await getGroupIdOrReply(event);

  if (!group.ok) {
    return group.reply;
  }

  const actorDisplayName = await resolveActorDisplayName(event);
  const result = await createLedgerForGroup(group.groupId, name, {
    lineUserId,
    displayName: actorDisplayName
  });
  const participants = await getActiveLedgerParticipants(group.groupId);
  const memberNames = formatParticipantNames(participants.participants);

  return [
    `已建立活動：${result.ledger.name}`,
    `${actorDisplayName}已加入該活動：${result.ledger.name}`,
    "",
    `目前成員：${formatMemberList(memberNames)}`,
    "",
    "其他人可輸入：",
    "+ 加入",
    "- 退出",
    "",
    "若要手動新增成員，請輸入：",
    "新增成員 小明 小華 小美",
    "",
    "全部確認後請輸入「確認成員」"
  ].join("\n");
}

async function handleJoinOrLeave(event: LineMessageEvent, action: "join" | "leave") {
  const { lineUserId } = getChatContext(event.source);
  const group = await getGroupIdOrReply(event);

  if (!group.ok) {
    return group.reply;
  }

  const displayName = await resolveActorDisplayName(event);
  const result =
    action === "join"
      ? await joinCollectingLedger({
          groupId: group.groupId,
          lineUserId,
          displayName
        })
      : await leaveCollectingLedger({
          groupId: group.groupId,
          lineUserId,
          displayName
        });

  if (result.status === "no-ledger") {
    return getNoActiveLedgerText();
  }

  if (result.status === "not-collecting") {
    return "本次活動成員已確認，不能再直接加入或退出。";
  }

  const memberNames = formatParticipantNames(result.participants);

  if (result.status === "already-joined") {
    return [
      "你已經在活動中了。",
      "",
      "目前成員：",
      formatMemberList(memberNames)
    ].join("\n");
  }

  if (result.status === "not-joined") {
    return [
      "你目前不在活動中。",
      "",
      "目前成員：",
      formatMemberList(memberNames)
    ].join("\n");
  }

  const verb = action === "join" ? "已加入" : "已退出";

  return [
    `${displayName}${verb}該活動：${result.ledgerName}`,
    "",
    "目前成員：",
    formatMemberList(memberNames)
  ].join("\n");
}

async function handleAddMembers(event: LineMessageEvent, names: string[]) {
  const { lineUserId } = getChatContext(event.source);
  const group = await getGroupIdOrReply(event);

  if (!group.ok) {
    return group.reply;
  }

  const result = await addMembersToCollectingLedger({
    groupId: group.groupId,
    requesterLineUserId: lineUserId,
    names
  });
  const memberNames = formatParticipantNames(result.participants);

  if (result.status === "no-ledger") {
    return getNoActiveLedgerText();
  }

  if (result.status === "forbidden") {
    return "只有活動建立者可以手動新增成員。";
  }

  if (result.status === "not-collecting") {
    return "本次活動成員已確認，不能再手動新增成員。";
  }

  if (result.status === "already-exists") {
    return [
      "這些成員已經在活動中了。",
      "",
      "目前成員：",
      formatMemberList(memberNames)
    ].join("\n");
  }

  return [
    `已新增成員：${result.addedNames.join("、")}`,
    "",
    "目前成員：",
    formatMemberList(memberNames)
  ].join("\n");
}

async function handleRemoveMember(event: LineMessageEvent, name: string) {
  const { lineUserId } = getChatContext(event.source);
  const group = await getGroupIdOrReply(event);

  if (!group.ok) {
    return group.reply;
  }

  const result = await removeMemberFromCollectingLedger({
    groupId: group.groupId,
    requesterLineUserId: lineUserId,
    name
  });
  const memberNames = formatParticipantNames(result.participants);

  if (result.status === "no-ledger") {
    return getNoActiveLedgerText();
  }

  if (result.status === "forbidden") {
    return "只有活動建立者可以刪除成員。";
  }

  if (result.status === "not-collecting") {
    return "本次活動成員已確認，不能再刪除成員。";
  }

  if (result.status === "not-found") {
    return `找不到成員：${name}`;
  }

  return [
    `已刪除成員：${result.removedName}`,
    "",
    "目前成員：",
    formatMemberList(memberNames)
  ].join("\n");
}

async function handleConfirmMembers(event: LineMessageEvent) {
  const { lineUserId } = getChatContext(event.source);
  const group = await getGroupIdOrReply(event);

  if (!group.ok) {
    return group.reply;
  }

  const activeLedger = await getActiveLedger(group.groupId);

  if (!activeLedger) {
    return getNoActiveLedgerText();
  }

  if (activeLedger.creatorLineUserId && activeLedger.creatorLineUserId !== lineUserId) {
    return "只有活動建立者可以確認成員";
  }

  const result = await confirmCollectingLedger(group.groupId);

  if (result.status === "no-participants") {
    return "目前尚未有活動成員，請先加入或新增成員。";
  }

  const participants = result.participants.map((participant) => participant.displayName);
  const missingPayment = result.ledger
    ? await getMembersMissingPaymentMethod(result.ledger.id)
    : [];

  const paymentLines =
    missingPayment.length > 0
      ? ["尚未設定收款方式：", missingPayment.join("、")]
      : ["所有成員都已設定收款方式"];

  return [
    `已確認活動：${result.ledger?.name ?? activeLedger.name}`,
    "",
    "目前成員：",
    formatMemberList(participants),
    "",
    ...paymentLines,
    "",
    "現在可以開始記帳。"
  ].join("\n");
}

function resolveMemberByName(
  participants: ParticipantRef[],
  input: string,
  options?: {
    lineUserId?: string;
    actorDisplayName?: string;
  }
): ResolvedMember {
  const normalized = normalizeName(input);

  if (input === "我") {
    const byUserId = options?.lineUserId
      ? participants.find((participant) => participant.lineUserId === options.lineUserId)
      : null;

    if (byUserId) {
      return {
        ok: true,
        member: byUserId
      };
    }

    if (options?.actorDisplayName) {
      return resolveMemberByName(participants, options.actorDisplayName);
    }

    return {
      ok: false,
      reason: "找不到你在活動中的成員資料"
    };
  }

  const exact = participants.find(
    (participant) =>
      normalizeName(participant.displayName) === normalized ||
      normalizeName(participant.memberName) === normalized
  );

  if (exact) {
    return {
      ok: true,
      member: exact
    };
  }

  const partial = participants.filter(
    (participant) =>
      normalizeName(participant.displayName).includes(normalized) ||
      normalizeName(participant.memberName).includes(normalized)
  );

  if (partial.length === 1 && partial[0]) {
    return {
      ok: true,
      member: partial[0]
    };
  }

  if (partial.length > 1) {
    return {
      ok: false,
      reason: `「${input}」對應到多位成員，請輸入更完整的名字`
    };
  }

  return {
    ok: false,
    reason: `找不到成員：${input}`
  };
}

function uniqueMembers(members: ParticipantRef[]) {
  const seen = new Set<string>();
  const output: ParticipantRef[] = [];

  for (const member of members) {
    if (seen.has(member.memberId)) {
      continue;
    }

    seen.add(member.memberId);
    output.push(member);
  }

  return output;
}

async function resolveExpenseMembers(input: {
  groupId: string;
  event: LineMessageEvent;
  parsed: ParsedExpenseBlock;
}) {
  const { lineUserId } = getChatContext(input.event.source);
  const actorDisplayName = await resolveActorDisplayName(input.event);
  const active = await getConfirmedMemberIdsForActiveLedger(input.groupId);

  if (!active.ledger) {
    return {
      ok: false as const,
      reply: getNoActiveLedgerText()
    };
  }

  if (active.ledger.isCollectingMembers) {
    return {
      ok: false as const,
      reply: "成員尚未確認，請先由活動建立者輸入「確認成員」。"
    };
  }

  if (active.participants.length === 0) {
    return {
      ok: false as const,
      reply: "目前沒有活動成員，請先加入或新增成員。"
    };
  }

  const payer = resolveMemberByName(active.participants, input.parsed.payerName, {
    lineUserId,
    actorDisplayName
  });

  if (!payer.ok) {
    return {
      ok: false as const,
      reply: payer.reason
    };
  }

  return {
    ok: true as const,
    active,
    payer: payer.member,
    lineUserId,
    actorDisplayName
  };
}

async function createParsedExpense(input: {
  groupId: string;
  event: LineMessageEvent;
  parsed: ParsedExpenseBlock;
}) {
  const resolved = await resolveExpenseMembers(input);

  if (!resolved.ok) {
    return {
      ok: false as const,
      reply: resolved.reply
    };
  }

  const amountCents = parseAmountToCents(input.parsed.amount);
  let participantIds: string[] | undefined;
  let participantShares: Array<{ memberId: string; shareCents: number }> | undefined;
  let participantNames: string[] = [];
  let excludedNames: string[] = [];

  if (input.parsed.shares.length > 0) {
    const shares: Array<{ member: ParticipantRef; shareCents: number }> = [];
    let explicitShareTotal = 0;

    for (const share of input.parsed.shares) {
      const member = resolveMemberByName(resolved.active.participants, share.name, {
        lineUserId: resolved.lineUserId,
        actorDisplayName: resolved.actorDisplayName
      });

      if (!member.ok) {
        return {
          ok: false as const,
          reply: member.reason
        };
      }

      const shareCents = parseAmountToCents(share.amount);
      explicitShareTotal += shareCents;
      shares.push({
        member: member.member,
        shareCents
      });
    }

    const remaining = amountCents - explicitShareTotal;

    if (remaining < 0) {
      return {
        ok: false as const,
        reply: [
          "細項加總超過總金額，請確認金額。",
          "",
          `總金額：${formatAmountForDisplay(amountCents)}`,
          `細項加總：${formatAmountForDisplay(explicitShareTotal)}`,
          `差額：${formatAmountForDisplay(explicitShareTotal - amountCents)}`
        ].join("\n")
      };
    }

    const byMemberId = new Map<string, { member: ParticipantRef; shareCents: number }>();

    for (const share of shares) {
      const current = byMemberId.get(share.member.memberId);
      byMemberId.set(share.member.memberId, {
        member: share.member,
        shareCents: (current?.shareCents ?? 0) + share.shareCents
      });
    }

    if (remaining > 0) {
      const current = byMemberId.get(resolved.payer.memberId);
      byMemberId.set(resolved.payer.memberId, {
        member: resolved.payer,
        shareCents: (current?.shareCents ?? 0) + remaining
      });
    }

    const finalShares = [...byMemberId.values()];
    participantShares = finalShares.map((share) => ({
      memberId: share.member.memberId,
      shareCents: share.shareCents
    }));
    participantNames = finalShares.map((share) => share.member.displayName);
    excludedNames = resolved.active.participants
      .filter((participant) => !byMemberId.has(participant.memberId))
      .map((participant) => participant.displayName);
  } else if (input.parsed.participantNames && input.parsed.participantNames.length > 0) {
    const members: ParticipantRef[] = [resolved.payer];

    for (const name of input.parsed.participantNames) {
      const member = resolveMemberByName(resolved.active.participants, name, {
        lineUserId: resolved.lineUserId,
        actorDisplayName: resolved.actorDisplayName
      });

      if (!member.ok) {
        return {
          ok: false as const,
          reply: member.reason
        };
      }

      members.push(member.member);
    }

    const unique = uniqueMembers(members);
    participantIds = unique.map((member) => member.memberId);
    participantNames = unique.map((member) => member.displayName);
    const included = new Set(participantIds);
    excludedNames = resolved.active.participants
      .filter((participant) => !included.has(participant.memberId))
      .map((participant) => participant.displayName);
  } else {
    participantIds = resolved.active.memberIds;
    participantNames = resolved.active.memberNames;
    excludedNames = [];
  }

  const created = await createExpenseInGroup({
    groupId: input.groupId,
    title: input.parsed.title,
    amount: input.parsed.amount,
    payerId: resolved.payer.memberId,
    participantIds,
    participantShares
  });

  return {
    ok: true as const,
    title: created.expense.title,
    amountCents: created.expense.amountCents,
    payerName: resolved.payer.displayName,
    participantNames,
    excludedNames
  };
}

async function handleExpenseInput(event: LineMessageEvent, text: string) {
  const group = await getGroupIdOrReply(event);

  if (!group.ok) {
    return group.reply;
  }

  const blocks = splitExpenseBlocks(text);

  if (blocks.length === 0) {
    return getExpenseGuideText();
  }

  const successes: Array<{
    title: string;
    amountCents: number;
    payerName: string;
    participantNames: string[];
    excludedNames: string[];
  }> = [];
  const failures: Array<{ block: string; reason: string }> = [];

  for (const block of blocks) {
    const parsed = parseExpenseBlock(block);

    if ("reason" in parsed) {
      failures.push(parsed);
      continue;
    }

    const result = await createParsedExpense({
      groupId: group.groupId,
      event,
      parsed
    });

    if (!result.ok) {
      failures.push({
        block,
        reason: result.reply
      });
      continue;
    }

    successes.push(result);
  }

  if (successes.length === 0) {
    return [
      "格式不正確，請重新輸入。",
      "",
      "例如：",
      "晚餐1000我付",
      "晚餐1000我付 小明 小華分",
      "晚餐1000我付400小明200小華",
      "",
      ...failures.map((failure) => `- ${failure.block}：${failure.reason}`)
    ].join("\n");
  }

  const snapshot = await getSettlementSnapshot(group.groupId);
  const replyLines = [
    `已新增 ${successes.length} 筆支出：`,
    "",
    ...successes.map(
      (expense, index) =>
        `${index + 1}. ${expense.title}${formatAmountForDisplay(expense.amountCents)}｜${expense.payerName}付`
    )
  ];

  if (successes.length === 1 && successes[0]) {
    replyLines.push(
      "",
      "分攤成員：",
      formatMemberList(successes[0].participantNames),
      "",
      "未分攤：",
      successes[0].excludedNames.length > 0
        ? successes[0].excludedNames.join("、")
        : "無"
    );
  }

  if (failures.length > 0) {
    replyLines.push(
      "",
      "以下項目未新增，請確認格式：",
      "",
      ...failures.map((failure) => `- ${failure.block}：${failure.reason}`)
    );
  }

  replyLines.push("", buildSettlementText(buildSettlementLines(snapshot)));

  return replyLines.join("\n");
}

async function handleRecentExpenses(event: LineMessageEvent) {
  const group = await getGroupIdOrReply(event);

  if (!group.ok) {
    return group.reply;
  }

  const recent = await getRecentExpenses(group.groupId, 50);

  if (!recent.activeLedger) {
    return getNoActiveLedgerText();
  }

  const expenses = [...recent.expenses].reverse();
  const expenseLines =
    expenses.length > 0
      ? expenses.map((expense) => `${expense.title}${formatAmountForDisplay(expense.amountCents)}`)
      : ["目前沒有支出。"];
  const snapshot = await getSettlementSnapshot(group.groupId);

  return [
    "目前支出：",
    "",
    ...expenseLines,
    "",
    buildSettlementText(buildSettlementLines(snapshot))
  ].join("\n");
}

async function handleDeleteExpensePrompt(event: LineMessageEvent) {
  const { chatId, lineUserId } = getChatContext(event.source);
  const group = await getGroupIdOrReply(event);

  if (!group.ok) {
    return group.reply;
  }

  const recent = await getRecentExpenses(group.groupId, 50);

  if (!recent.activeLedger) {
    return getNoActiveLedgerText();
  }

  if (recent.expenses.length === 0) {
    return "目前沒有可刪除的支出。";
  }

  setDeleteExpenseState(chatId, lineUserId);
  const expenses = [...recent.expenses].reverse();

  return [
    "目前支出：",
    "",
    ...expenses.map((expense) => `${expense.title}${formatAmountForDisplay(expense.amountCents)}`),
    "",
    "請輸入要刪除的項目名稱"
  ].join("\n");
}

async function handleDeleteExpenseByName(event: LineMessageEvent, text: string) {
  const { chatId, lineUserId } = getChatContext(event.source);
  const group = await getGroupIdOrReply(event);

  if (!group.ok) {
    return group.reply;
  }

  const target = normalizeName(text);
  const recent = await getRecentExpenses(group.groupId, 50);
  const expense = recent.expenses.find((item) => {
    const label = `${item.title}${formatAmountForDisplay(item.amountCents)}`;
    return normalizeName(label) === target || normalizeName(item.title) === target;
  });

  if (!expense) {
    return "找不到這筆支出，請重新輸入項目名稱。";
  }

  await db.expense.delete({
    where: {
      id: expense.id
    }
  });
  clearDeleteExpenseState(chatId, lineUserId);

  const snapshot = await getSettlementSnapshot(group.groupId);

  return [
    `已刪除支出：${expense.title}${formatAmountForDisplay(expense.amountCents)}`,
    "",
    buildSettlementText(buildSettlementLines(snapshot))
  ].join("\n");
}

async function handleSettlement(event: LineMessageEvent) {
  const group = await getGroupIdOrReply(event);

  if (!group.ok) {
    return group.reply;
  }

  const snapshot = await getSettlementSnapshot(group.groupId);

  if (!snapshot?.activeLedger) {
    return getNoActiveLedgerText();
  }

  return buildSettlementText(buildSettlementLines(snapshot));
}

async function continuePaymentSetup(lineUserId: string, draft: PaymentSetupDraft) {
  const [nextSelection, ...remainingSelections] = draft.pendingSelections;
  const nextDraft = defaultPaymentSetupDraft({
    ...draft,
    pendingSelections: remainingSelections
  });

  if (nextSelection === 1) {
    await updateLineUserProfileDraft(lineUserId, PAYMENT_SETUP_STEPS.awaitingBankInfo, nextDraft);
    return getBankAccountPrompt();
  }

  if (nextSelection === 4) {
    await updateLineUserProfileDraft(lineUserId, PAYMENT_SETUP_STEPS.awaitingOtherMethod, nextDraft);
    return getOtherPaymentPrompt();
  }

  if (nextSelection === 5) {
    await updateLineUserProfileDraft(lineUserId, PAYMENT_SETUP_STEPS.awaitingNote, nextDraft);
    return getPaymentNotePrompt();
  }

  await db.lineUserProfile.update({
    where: {
      lineUserId
    },
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

  return formatPaymentSummary(draft);
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

    const nextDraft = defaultPaymentSetupDraft({
      ...draft,
      acceptLinePay: draft.acceptLinePay || selection.selections.includes(2),
      acceptCash: draft.acceptCash || selection.selections.includes(3),
      pendingSelections: selection.selections.filter(
        (value) => value === 1 || value === 4 || value === 5
      )
    });

    return continuePaymentSetup(lineUserId, nextDraft);
  }

  if (step === PAYMENT_SETUP_STEPS.awaitingBankInfo) {
    if (!normalized.includes("/")) {
      return getBankAccountInvalidPrompt();
    }

    return continuePaymentSetup(
      lineUserId,
      defaultPaymentSetupDraft({
        ...draft,
        acceptBankTransfer: true,
        bankName: "銀行帳戶",
        bankAccount: normalized
      })
    );
  }

  if (step === PAYMENT_SETUP_STEPS.awaitingOtherMethod) {
    return continuePaymentSetup(
      lineUserId,
      defaultPaymentSetupDraft({
        ...draft,
        acceptBankTransfer: true,
        bankName: "其他",
        bankAccount: normalized
      })
    );
  }

  if (step === PAYMENT_SETUP_STEPS.awaitingNote) {
    return continuePaymentSetup(
      lineUserId,
      defaultPaymentSetupDraft({
        ...draft,
        paymentNote: normalized
      })
    );
  }

  return null;
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

  await updateLineUserProfileDraft(lineUserId, PAYMENT_SETUP_STEPS.awaitingMethodChoice, draft);
  return getPaymentSetupMenuText();
}

async function handleMessageEvent(event: LineMessageEvent): Promise<LineTextReplyPayload | null> {
  const { chatId, chatType, lineUserId } = getChatContext(event.source);
  const rawText = event.message.text.trim();

  console.log("LINE text received", {
    chatId,
    chatType,
    lineUserId,
    text: rawText
  });

  if (!rawText || (chatType !== "user" && isUrlLikeText(rawText))) {
    return null;
  }

  if (chatType === "user") {
    if (!lineUserId) {
      return "小二找不到你的 LINE 使用者資訊，請稍後再試。";
    }

    const paymentReply = await handlePaymentSetupResponse(lineUserId, rawText);
    if (paymentReply) {
      return paymentReply;
    }

    const parsed = parseLineCommand(rawText);
    if (parsed.kind === "start-payment-setup") {
      return startPaymentSetup(lineUserId);
    }

    return null;
  }

  if (rawText === "設定") {
    return null;
  }

  if (hasDeleteExpenseState(chatId, lineUserId)) {
    if (rawText === "取消") {
      clearDeleteExpenseState(chatId, lineUserId);
      return "已取消刪除支出。";
    }

    return handleDeleteExpenseByName(event, rawText);
  }

  const parsed = parseLineCommand(rawText);

  switch (parsed.kind) {
    case "xiaoer-help":
      return getXiaoerMenuText();

    case "settlement":
      return handleSettlement(event);

    case "create-ledger-help":
      return "請輸入：建立活動 活動名稱";

    case "create-ledger":
      return parsed.name ? handleCreateLedger(event, parsed.name) : "請輸入：建立活動 活動名稱";

    case "join-activity":
      return handleJoinOrLeave(event, "join");

    case "leave-activity":
      return handleJoinOrLeave(event, "leave");

    case "add-members":
      return handleAddMembers(event, parsed.names);

    case "remove-member":
      return handleRemoveMember(event, parsed.name);

    case "confirm-members":
      return handleConfirmMembers(event);

    case "start-payment-setup":
      return getPaymentSetupGuideText();

    case "expense-help": {
      const inlineExpense = rawText.replace(/^新增支出\s*/u, "").trim();

      if (inlineExpense) {
        return handleExpenseInput(event, inlineExpense);
      }

      return getExpenseGuideText();
    }

    case "recent-expenses":
      return handleRecentExpenses(event);

    case "delete-last-expense":
      return handleDeleteExpensePrompt(event);

    case "ignored":
      if (looksLikeExpenseInput(rawText)) {
        return handleExpenseInput(event, rawText);
      }

      return null;

    default:
      return null;
  }
}

async function handleJoinLikeEvent(event: LineJoinLikeEvent) {
  if (event.source.type === "group" || event.source.type === "room") {
    const binding = await getOrCreateGroupContext(event.source);
    const lineGroupId = event.source.type === "group" ? event.source.groupId : event.source.roomId;

    console.log("LINE bot joined chat", {
      lineGroupId,
      groupId: binding?.group.id
    });

    return [
      "我已加入這個群組，可直接建立活動與記帳。",
      "",
      `群組 ID：${lineGroupId ?? "未知"}`,
      "",
      "例如輸入：",
      "建立活動 宜蘭三天兩夜"
    ].join("\n");
  }

  return "請在群組中邀請小二，或私聊輸入【設定】設定收款方式。";
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
