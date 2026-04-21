import { Prisma } from "@prisma/client";

import { formatCents } from "@/lib/currency";
import { db } from "@/lib/db";
import {
  archiveLedger,
  closeActiveLedger,
  createLedgerForGroup,
  getActiveLedger,
  listLedgers,
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
import {
  createExpenseInGroup,
  createGroup,
  formatExpenseLine,
  getRecentExpenses,
  getSettlementSnapshot
} from "@/lib/group-service";
import { parseLineCommand } from "@/lib/line/parser";
import type {
  LineEvent,
  LineMessageEvent,
  ParsedExpenseCommand
} from "@/lib/line/types";

function getChatContext(source: LineEvent["source"]) {
  if (source.type === "group") {
    return {
      chatId: source.groupId ?? "",
      chatType: "group",
      lineUserId: source.userId
    };
  }

  if (source.type === "room") {
    return {
      chatId: source.roomId ?? "",
      chatType: "room",
      lineUserId: source.userId
    };
  }

  return {
    chatId: source.userId ?? "",
    chatType: "user",
    lineUserId: source.userId
  };
}

function helpText() {
  return [
    "小的來哩~大人有什麼吩咐~",
    "1. 建立群組：1嘉義兩天一夜",
    "2. 綁定群組：2ABC123",
    "建立活動：建立活動 宜蘭三天兩夜",
    "切換活動：切換活動 台中一日遊",
    "目前活動：目前活動",
    "查看帳本：查看帳本",
    "結束活動：結束活動",
    "封存帳本：封存帳本 宜蘭三天兩夜",
    "3. 查看結算",
    "4. 查看最近支出",
    "5. 查看成員",
    "6. 刪除最後一筆支出",
    "7. 支出",
    "8. 新增成員：8阿明,小美,阿豪",
    "9. 刪除成員：9阿豪",
    "私聊我：10 設定收款",
    "私聊我：11 查看我的付款方式"
  ].join("\n");
}

function createGroupHelpText() {
  return ["建立群組格式：", "1嘉義兩天一夜", "或", "建立群組 嘉義兩天一夜"].join(
    "\n"
  );
}

function bindHelpText() {
  return ["綁定群組格式：", "2ABC123", "或", "綁定群組 ABC123"].join("\n");
}

function addMemberHelpText() {
  return [
    "新增成員格式：",
    "8阿明,小美,阿豪",
    "或",
    "新增成員 阿明,小美,阿豪"
  ].join("\n");
}

function deleteMemberHelpText() {
  return [
    "刪除成員格式：",
    "9阿豪",
    "或",
    "刪除阿豪",
    "或",
    "刪除成員 阿豪"
  ].join("\n");
}

function expenseHelpText() {
  return [
    "支出格式：",
    "支出 晚餐 600 4人 阿明付款",
    "支出 晚餐 600 阿明付款 參與:阿明,小美,阿豪,小明",
    "手機快打：7芋圓300翔濠魚",
    "指定付款人：7芋圓300濠付翔濠魚"
  ].join("\n");
}

function noActiveLedgerText() {
  return "目前沒有進行中的帳本，請先輸入：建立活動 活動名稱";
}

function formatLedgerStatus(status: "active" | "closed" | "archived") {
  if (status === "active") {
    return "進行中";
  }

  if (status === "closed") {
    return "已結束";
  }

  return "已封存";
}

function parseBooleanChoice(text: string) {
  const normalized = text.trim();

  if (["是", "可收", "接受", "收", "yes", "y", "Y"].includes(normalized)) {
    return true;
  }

  if (["否", "不收", "不接受", "no", "n", "N"].includes(normalized)) {
    return false;
  }

  return null;
}

function isSkipText(text: string) {
  return ["略過", "不用", "沒有", "無"].includes(text.trim());
}

function formatOwnPaymentSettings(profile: {
  memberName: string | null;
  acceptBankTransfer: boolean;
  bankName: string | null;
  bankAccount: string | null;
  acceptLinePay: boolean;
  acceptCash: boolean;
  paymentNote: string | null;
}) {
  return [
    `名字：${profile.memberName ?? "尚未設定"}`,
    profile.acceptBankTransfer && profile.bankAccount
      ? `銀行轉帳：${[profile.bankName, profile.bankAccount].filter(Boolean).join(" / ")}`
      : "銀行轉帳：不收",
    `LINE Pay：${profile.acceptLinePay ? "可收" : "不收"}`,
    `現金：${profile.acceptCash ? "可收" : "不收"}`,
    `備註：${profile.paymentNote ?? "無"}`
  ].join("\n");
}

function formatSettlementPaymentMethods(profile: {
  acceptBankTransfer: boolean;
  bankName: string | null;
  bankAccount: string | null;
  acceptLinePay: boolean;
  acceptCash: boolean;
  paymentNote: string | null;
  hasAnyMethod: boolean;
} | null) {
  if (!profile || !profile.hasAnyMethod) {
    return "收款方式：尚未設定";
  }

  const lines: string[] = [];

  if (profile.acceptBankTransfer && profile.bankAccount) {
    lines.push(
      `銀行轉帳：${[profile.bankName, profile.bankAccount].filter(Boolean).join(" / ")}`
    );
  } else {
    lines.push("銀行轉帳：不收");
  }

  lines.push(`LINE Pay：${profile.acceptLinePay ? "可收" : "不收"}`);
  lines.push(`現金：${profile.acceptCash ? "可收" : "不收"}`);

  if (profile.paymentNote) {
    lines.push(`備註：${profile.paymentNote}`);
  }

  return lines.join("\n");
}

function formatSettlementLine(item: {
  fromName: string;
  toName: string;
  amountDisplay: string;
  toMemberPaymentProfile?: {
    acceptBankTransfer: boolean;
    bankName: string | null;
    bankAccount: string | null;
    acceptLinePay: boolean;
    acceptCash: boolean;
    paymentNote: string | null;
    hasAnyMethod: boolean;
  } | null;
}) {
  return [
    `${item.fromName} → ${item.toName}`,
    `金額：NT$ ${item.amountDisplay}`,
    formatSettlementPaymentMethods(item.toMemberPaymentProfile ?? null)
  ].join("\n");
}

function resolveCompactNames(
  blob: string,
  memberNames: string[],
  expectedCount?: number
): string[] | null {
  const candidates = [...memberNames].sort((left, right) => right.length - left.length);

  function dfs(remaining: string, picked: string[]): string[] | null {
    if (remaining.length === 0) {
      if (expectedCount && picked.length !== expectedCount) {
        return null;
      }

      return picked.length > 0 ? picked : null;
    }

    if (expectedCount && picked.length >= expectedCount) {
      return null;
    }

    for (const candidate of candidates) {
      if (!remaining.startsWith(candidate)) {
        continue;
      }

      const resolved = dfs(remaining.slice(candidate.length), [...picked, candidate]);

      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  return dfs(blob, []);
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

async function bindGroup(
  chatId: string,
  chatType: string,
  lineUserId: string | undefined,
  target: string
) {
  const exactCode = target.trim().toUpperCase();
  const group = await db.group.findFirst({
    where: {
      OR: [
        {
          lineJoinCode: exactCode
        },
        {
          name: target.trim()
        }
      ]
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (!group) {
    return "找不到要綁定的群組，請確認綁定碼或群組名稱是否正確。";
  }

  await db.lineChatBinding.upsert({
    where: {
      chatId
    },
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

  return `已綁定群組：${group.name}\n接下來請先輸入「建立活動 活動名稱」，再開始記帳。`;
}

async function handleAddMemberCommand(chatId: string, names: string[]) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "這個聊天室還沒綁定群組，請先輸入：2綁定碼";
  }

  if (names.length === 0) {
    return "請輸入要新增的成員，例如：8阿明,小美,阿豪";
  }

  const createdNames: string[] = [];
  const skippedNames: string[] = [];

  for (const name of names) {
    try {
      const member = await db.member.create({
        data: {
          name,
          groupId: binding.group.id
        }
      });
      createdNames.push(member.name);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        skippedNames.push(name);
        continue;
      }

      throw error;
    }
  }

  if (createdNames.length === 0 && skippedNames.length > 0) {
    return `這些成員已經存在：${skippedNames.join("、")}`;
  }

  if (createdNames.length > 0 && skippedNames.length > 0) {
    return `已新增：${createdNames.join("、")}\n已略過重複成員：${skippedNames.join("、")}`;
  }

  return `已新增成員：${createdNames.join("、")}`;
}

async function handleDeleteMemberCommand(chatId: string, name: string) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "這個聊天室還沒綁定群組，請先輸入：2綁定碼";
  }

  const targetName = name.trim();

  if (!targetName) {
    return "請輸入要刪除的成員名稱。";
  }

  const member = await db.member.findFirst({
    where: {
      groupId: binding.group.id,
      name: targetName
    },
    include: {
      _count: {
        select: {
          paidExpenses: true,
          participations: true
        }
      }
    }
  });

  if (!member) {
    return `找不到成員「${targetName}」，可以先輸入 5 查看成員。`;
  }

  if (member._count.paidExpenses > 0 || member._count.participations > 0) {
    return `成員「${member.name}」已經有帳務紀錄，不能直接刪除。`;
  }

  await db.member.delete({
    where: {
      id: member.id
    }
  });

  return `已刪除成員：${member.name}`;
}

async function handleListMembersCommand(chatId: string) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "這個聊天室還沒綁定群組，請先輸入：2綁定碼";
  }

  if (binding.group.members.length === 0) {
    return `群組「${binding.group.name}」目前還沒有成員。`;
  }

  const activeLedger = await getActiveLedger(binding.group.id);

  return [
    `群組「${binding.group.name}」成員：`,
    activeLedger ? `目前帳本：${activeLedger.name}` : "目前帳本：尚未建立",
    ...binding.group.members.map((member, index) => `${index + 1}. ${member.name}`)
  ].join("\n");
}

async function handleDeleteLastExpenseCommand(chatId: string) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "這個聊天室還沒綁定群組，請先輸入：2綁定碼";
  }

  const activeLedger = await getActiveLedger(binding.group.id);

  if (!activeLedger) {
    return noActiveLedgerText();
  }

  const latestExpense = await db.expense.findFirst({
    where: {
      ledgerId: activeLedger.id
    },
    orderBy: {
      createdAt: "desc"
    },
    include: {
      payer: true
    }
  });

  if (!latestExpense) {
    return `活動「${activeLedger.name}」目前還沒有支出可刪除。`;
  }

  await db.lineChatBinding.update({
    where: {
      chatId
    },
    data: {
      pendingDeleteExpenseId: latestExpense.id
    }
  });

  return [
    `要刪除的是「${activeLedger.name}」的最後一筆支出：`,
    `${latestExpense.title} / NT$ ${formatCents(latestExpense.amountCents)} / ${latestExpense.payer.name} 付款`,
    "回覆「是」或「Y」確認刪除，回覆「否」取消。"
  ].join("\n");
}

async function handleConfirmDeleteCommand(chatId: string) {
  const binding = await getBoundGroup(chatId);

  if (!binding?.pendingDeleteExpenseId) {
    return null;
  }

  const expense = await db.expense.findFirst({
    where: {
      id: binding.pendingDeleteExpenseId,
      groupId: binding.group.id
    },
    include: {
      payer: true,
      ledger: true
    }
  });

  await db.lineChatBinding.update({
    where: {
      chatId
    },
    data: {
      pendingDeleteExpenseId: null
    }
  });

  if (!expense) {
    return "找不到要刪除的支出，可能已被刪除。";
  }

  await db.expense.delete({
    where: {
      id: expense.id
    }
  });

  return `已刪除「${expense.ledger.name}」中的支出：${expense.title} / NT$ ${formatCents(expense.amountCents)} / ${expense.payer.name} 付款`;
}

async function handleCancelDeleteCommand(chatId: string) {
  const binding = await getBoundGroup(chatId);

  if (!binding?.pendingDeleteExpenseId) {
    return null;
  }

  await db.lineChatBinding.update({
    where: {
      chatId
    },
    data: {
      pendingDeleteExpenseId: null
    }
  });

  return "已取消刪除最後一筆支出。";
}

async function handleExpenseCommand(chatId: string, command: ParsedExpenseCommand) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "這個聊天室還沒綁定群組，請先輸入：2綁定碼";
  }

  const activeLedger = await getActiveLedger(binding.group.id);

  if (!activeLedger) {
    return noActiveLedgerText();
  }

  const memberMap = new Map(
    binding.group.members.map((member) => [member.name.toLowerCase(), member])
  );

  let payerName = command.payerName;
  let participantNames = command.participantNames;
  let participantCount = command.participantCount;

  if (command.compactMemberBlob) {
    const resolvedNames = resolveCompactNames(
      command.compactMemberBlob,
      binding.group.members.map((member) => member.name),
      command.participantCount
    );

    if (!resolvedNames) {
      return "我看不懂這筆支出的參與者，請確認名字有在群組成員裡。";
    }

    participantNames = resolvedNames;
    participantCount = resolvedNames.length;

    if (!payerName) {
      payerName = resolvedNames[0];
    }
  }

  if (!payerName) {
    return "請指定付款人。";
  }

  const payer = memberMap.get(payerName.toLowerCase());

  if (!payer) {
    return `找不到付款人「${payerName}」，可以先輸入 5 查看成員。`;
  }

  let participants = binding.group.members;

  if (participantNames?.length) {
    const resolved = participantNames.map((name) => memberMap.get(name.toLowerCase()));

    if (resolved.some((member) => !member)) {
      return "分攤名單裡有不在群組裡的人，請先輸入 5 查看成員。";
    }

    participants = resolved.filter(
      (
        member
      ): member is (typeof binding.group.members)[number] => Boolean(member)
    );
  } else if (participantCount) {
    if (participantCount === binding.group.members.length) {
      participants = binding.group.members;
    } else {
      return `目前群組有 ${binding.group.members.length} 位成員。若不是全員分攤，請改用「支出 晚餐 600 阿明付款 參與:阿明,小美」或「7芋圓300翔濠魚」。`;
    }
  }

  if (participantCount && participantCount !== participants.length) {
    return "你輸入的人數和實際分攤名單數量不一致，請再檢查一次。";
  }

  const result = await createExpenseInGroup({
    groupId: binding.group.id,
    title: command.title,
    amount: command.amount,
    payerId: payer.id,
    participantIds: participants.map((member) => member.id),
    notes: "由 LINE Bot 建立"
  });

  const eachShare = result.expense.participants[0]?.shareDisplay ?? formatCents(0);

  return [
    `已記錄到活動：${result.ledger.name}`,
    `${result.expense.title}`,
    `總額 NT$ ${result.expense.amountDisplay}`,
    `${result.expense.participants.length} 人分攤，每人 NT$ ${eachShare}`,
    `付款人：${result.expense.payer.name}`
  ].join("\n");
}

function getPrivateChatOnlyMessage() {
  return "這個功能請私聊 Bot 使用，避免把個人付款資訊直接公開在群組。";
}

async function handleIdentifySelf(lineUserId: string, name: string) {
  const profile = await getOrCreateLineUserProfile(lineUserId);
  const cleanName = name.trim();

  if (!cleanName) {
    return "請輸入你在群組裡用的名字，例如：我是阿豪";
  }

  await db.lineUserProfile.update({
    where: { id: profile.id },
    data: { memberName: cleanName }
  });

  return `好，之後我會把你當成「${cleanName}」。如果你有新群組也用同樣名字，付款方式會直接沿用。`;
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

    return [
      "我們來設定你的收款方式。",
      "這份設定是跟著你的 LINE 帳號走，以後新群組也會沿用。",
      "請先輸入你在群組裡常用的名字，例如：阿豪"
    ].join("\n");
  }

  await updateLineUserProfileDraft(
    lineUserId,
    PAYMENT_SETUP_STEPS.awaitingBankChoice,
    draft
  );

  return [
    "你目前的付款方式：",
    formatOwnPaymentSettings({
      memberName: draft.memberName,
      acceptBankTransfer: draft.acceptBankTransfer,
      bankName: draft.bankName,
      bankAccount: draft.bankAccount,
      acceptLinePay: draft.acceptLinePay,
      acceptCash: draft.acceptCash,
      paymentNote: draft.paymentNote
    }),
    "",
    "銀行轉帳要收嗎？請回覆：可收 / 不收"
  ].join("\n");
}

async function cancelPaymentSetup(lineUserId: string) {
  await updateLineUserProfileDraft(lineUserId, null, null);
  return "已取消設定收款流程。";
}

async function viewMyPaymentSettings(lineUserId: string) {
  const profile = await db.lineUserProfile.findUnique({
    where: { lineUserId }
  });

  if (!profile) {
    return "你還沒有設定付款方式，先私聊我輸入 10 或 設定收款。";
  }

  return ["你目前的付款方式：", formatOwnPaymentSettings(profile)].join("\n");
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
      paymentNote: draft.paymentNote
    }
  });

  return [
    "已儲存你的付款方式。",
    formatOwnPaymentSettings({
      memberName: draft.memberName,
      acceptBankTransfer: draft.acceptBankTransfer,
      bankName: draft.bankName,
      bankAccount: draft.bankAccount,
      acceptLinePay: draft.acceptLinePay,
      acceptCash: draft.acceptCash,
      paymentNote: draft.paymentNote
    }),
    "",
    "之後新群組、新活動也會沿用這份設定。"
  ].join("\n");
}

async function handlePaymentSetupResponse(lineUserId: string, text: string) {
  const profile = await getOrCreateLineUserProfile(lineUserId);
  const draft = getCurrentPaymentDraft(profile);
  const setupState = profile.setupState as PaymentSetupStep | null;
  const message = text.trim();

  if (!setupState) {
    return null;
  }

  switch (setupState) {
    case PAYMENT_SETUP_STEPS.awaitingName: {
      if (!message) {
        return "請輸入你在群組裡常用的名字，例如：阿豪";
      }

      draft.memberName = message;
      await updateLineUserProfileDraft(
        lineUserId,
        PAYMENT_SETUP_STEPS.awaitingBankChoice,
        draft
      );

      return `好，名字先記成「${message}」。\n銀行轉帳要收嗎？請回覆：可收 / 不收`;
    }

    case PAYMENT_SETUP_STEPS.awaitingBankChoice: {
      const choice = parseBooleanChoice(message);

      if (choice === null) {
        return "請回覆：可收 / 不收";
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

      return "LINE Pay 要收嗎？請回覆：可收 / 不收";
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

      return "請輸入完整銀行帳號。這會在群組結算時完整顯示，方便大家直接複製。";
    }

    case PAYMENT_SETUP_STEPS.awaitingBankAccount: {
      if (!message) {
        return "請輸入完整銀行帳號。";
      }

      draft.bankAccount = message;
      await updateLineUserProfileDraft(
        lineUserId,
        PAYMENT_SETUP_STEPS.awaitingLinePayChoice,
        draft
      );

      return "LINE Pay 要收嗎？請回覆：可收 / 不收";
    }

    case PAYMENT_SETUP_STEPS.awaitingLinePayChoice: {
      const choice = parseBooleanChoice(message);

      if (choice === null) {
        return "請回覆：可收 / 不收";
      }

      draft.acceptLinePay = choice;
      await updateLineUserProfileDraft(
        lineUserId,
        PAYMENT_SETUP_STEPS.awaitingCashChoice,
        draft
      );

      return "現金要收嗎？請回覆：可收 / 不收";
    }

    case PAYMENT_SETUP_STEPS.awaitingCashChoice: {
      const choice = parseBooleanChoice(message);

      if (choice === null) {
        return "請回覆：可收 / 不收";
      }

      draft.acceptCash = choice;
      await updateLineUserProfileDraft(
        lineUserId,
        PAYMENT_SETUP_STEPS.awaitingNote,
        draft
      );

      return "有備註要補充嗎？沒有的話回：略過";
    }

    case PAYMENT_SETUP_STEPS.awaitingNote: {
      if (isSkipText(message)) {
        draft.paymentNote = null;
      } else {
        draft.paymentNote = message;
      }

      return finishPaymentSetup(lineUserId, draft);
    }

    default:
      return null;
  }
}

async function handleCreateLedgerCommand(chatId: string, name: string) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "這個聊天室還沒綁定群組，請先輸入：2綁定碼";
  }

  const result = await createLedgerForGroup(binding.group.id, name);

  if (result.previousActiveName) {
    return `已建立活動：${result.ledger.name}，並設為目前帳本。\n原本進行中的帳本「${result.previousActiveName}」已自動關閉。`;
  }

  return `已建立活動：${result.ledger.name}，並設為目前帳本。`;
}

async function handleSwitchLedgerCommand(chatId: string, name: string) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "這個聊天室還沒綁定群組，請先輸入：2綁定碼";
  }

  const result = await switchActiveLedger(binding.group.id, name);

  if (result.previousActiveName) {
    return `已切換到活動：${result.ledger.name}\n原本進行中的帳本「${result.previousActiveName}」已關閉。`;
  }

  return `已切換到活動：${result.ledger.name}`;
}

async function handleCurrentLedgerCommand(chatId: string) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "這個聊天室還沒綁定群組，請先輸入：2綁定碼";
  }

  const activeLedger = await getActiveLedger(binding.group.id);

  if (!activeLedger) {
    return noActiveLedgerText();
  }

  return [
    `目前帳本：${activeLedger.name}`,
    `狀態：${formatLedgerStatus(activeLedger.status)}`,
    `支出筆數：${activeLedger.expenseCount}`,
    `開始時間：${new Date(activeLedger.startedAt).toLocaleDateString("zh-TW")}`
  ].join("\n");
}

async function handleListLedgersCommand(chatId: string) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "這個聊天室還沒綁定群組，請先輸入：2綁定碼";
  }

  const ledgers = await listLedgers(binding.group.id);

  if (ledgers.length === 0) {
    return "目前還沒有任何帳本，請先輸入：建立活動 活動名稱";
  }

  const active = ledgers.find((ledger) => ledger.isActive);
  const closed = ledgers.filter((ledger) => ledger.status === "closed").slice(0, 5);
  const archived = ledgers.filter((ledger) => ledger.status === "archived");
  const archivedPreview = archived.slice(0, 3);

  const lines = [`群組「${binding.group.name}」帳本列表`];

  lines.push(active ? `目前進行中：${active.name}` : "目前進行中：無");

  if (closed.length > 0) {
    lines.push("最近結束：");
    lines.push(...closed.map((ledger) => `- ${ledger.name}`));
  }

  if (archived.length > 0) {
    lines.push(`已封存：共 ${archived.length} 本`);
    lines.push(...archivedPreview.map((ledger) => `- ${ledger.name}`));
    if (archived.length > archivedPreview.length) {
      lines.push(`- 其餘 ${archived.length - archivedPreview.length} 本未展開`);
    }
  }

  return lines.join("\n");
}

async function handleCloseLedgerCommand(chatId: string) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "這個聊天室還沒綁定群組，請先輸入：2綁定碼";
  }

  const ledger = await closeActiveLedger(binding.group.id);

  if (!ledger) {
    return noActiveLedgerText();
  }

  return `已結束活動：${ledger.name}`;
}

async function handleArchiveLedgerCommand(chatId: string, name: string) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "這個聊天室還沒綁定群組，請先輸入：2綁定碼";
  }

  const ledger = await archiveLedger(binding.group.id, name);
  return `已封存帳本：${ledger.name}`;
}

async function handleListArchivedLedgersCommand(chatId: string) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "這個聊天室還沒綁定群組，請先輸入：2綁定碼";
  }

  const ledgers = (await listLedgers(binding.group.id)).filter(
    (ledger) => ledger.status === "closed" || ledger.status === "archived"
  );

  if (ledgers.length === 0) {
    return "目前沒有歷史帳本。";
  }

  return [
    `群組「${binding.group.name}」歷史帳本：`,
    ...ledgers.map(
      (ledger) =>
        `- ${ledger.name}（${formatLedgerStatus(ledger.status)}）`
    )
  ].join("\n");
}

async function handleMessageEvent(event: LineMessageEvent, _appBaseUrl: string) {
  const { chatId, chatType, lineUserId } = getChatContext(event.source);

  if (!chatId) {
    return "目前無法辨識這個聊天室。";
  }

  const command = parseLineCommand(event.message.text);

  if (command.kind === "cancel-payment-setup") {
    if (!lineUserId) {
      return getPrivateChatOnlyMessage();
    }

    return cancelPaymentSetup(lineUserId);
  }

  if (lineUserId && chatType === "user") {
    const profile = await db.lineUserProfile.findUnique({
      where: { lineUserId }
    });

    if (profile?.setupState && command.kind === "ignored") {
      return handlePaymentSetupResponse(lineUserId, event.message.text);
    }
  }

  switch (command.kind) {
    case "ignored":
      return null;
    case "help":
      return helpText();
    case "create-group-help":
      return createGroupHelpText();
    case "bind-help":
      return bindHelpText();
    case "add-member-help":
      return addMemberHelpText();
    case "delete-member-help":
      return deleteMemberHelpText();
    case "expense-help":
      return expenseHelpText();
    case "identify-self":
      if (!lineUserId) {
        return getPrivateChatOnlyMessage();
      }

      return handleIdentifySelf(lineUserId, command.name);
    case "start-payment-setup":
      if (!lineUserId || chatType !== "user") {
        return "請私聊 Bot 輸入 10 或 設定收款，我再一步一步幫你設定。";
      }

      return startPaymentSetup(lineUserId);
    case "view-my-payment-settings":
      if (!lineUserId || chatType !== "user") {
        return "這個功能請私聊 Bot 使用。";
      }

      return viewMyPaymentSettings(lineUserId);
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

      return `已建立群組：${group.name}\n綁定碼：${group.lineJoinCode}\n接下來請先輸入「建立活動 活動名稱」。`;
    }
    case "bind":
      return bindGroup(chatId, chatType, lineUserId, command.target);
    case "create-ledger":
      return handleCreateLedgerCommand(chatId, command.name);
    case "switch-ledger":
      return handleSwitchLedgerCommand(chatId, command.name);
    case "current-ledger":
      return handleCurrentLedgerCommand(chatId);
    case "list-ledgers":
      return handleListLedgersCommand(chatId);
    case "close-ledger":
      return handleCloseLedgerCommand(chatId);
    case "archive-ledger":
      return handleArchiveLedgerCommand(chatId, command.name);
    case "list-archived-ledgers":
      return handleListArchivedLedgersCommand(chatId);
    case "add-member":
      return handleAddMemberCommand(chatId, command.names);
    case "delete-member":
      return handleDeleteMemberCommand(chatId, command.name);
    case "list-members":
      return handleListMembersCommand(chatId);
    case "delete-last-expense":
      return handleDeleteLastExpenseCommand(chatId);
    case "confirm-delete":
      return handleConfirmDeleteCommand(chatId);
    case "cancel-delete":
      return handleCancelDeleteCommand(chatId);
    case "settlement": {
      const binding = await getBoundGroup(chatId);

      if (!binding) {
        return "這個聊天室還沒綁定群組，請先輸入：2綁定碼";
      }

      const snapshot = await getSettlementSnapshot(binding.group.id);

      if (!snapshot) {
        return "找不到這個群組的結算資料。";
      }

      if (!snapshot.activeLedger) {
        return noActiveLedgerText();
      }

      if (snapshot.summary.settlement.length === 0) {
        return `活動「${snapshot.activeLedger.name}」目前沒有待結算金額。`;
      }

      return [
        `群組「${binding.group.name}」 / 活動「${snapshot.activeLedger.name}」結算`,
        ...snapshot.summary.settlement.map((item) => formatSettlementLine(item))
      ].join("\n\n");
    }
    case "recent-expenses": {
      const binding = await getBoundGroup(chatId);

      if (!binding) {
        return "這個聊天室還沒綁定群組，請先輸入：2綁定碼";
      }

      const result = await getRecentExpenses(binding.group.id, 5);

      if (!result.activeLedger) {
        return noActiveLedgerText();
      }

      if (result.expenses.length === 0) {
        return `活動「${result.activeLedger.name}」目前還沒有支出。`;
      }

      return [
        `活動「${result.activeLedger.name}」最近支出：`,
        ...result.expenses.map(formatExpenseLine)
      ].join("\n");
    }
    case "expense":
      return handleExpenseCommand(chatId, command);
  }
}

export async function handleLineEvent(event: LineEvent, appBaseUrl: string) {
  if (event.type === "follow" || event.type === "join") {
    return [
      "小二來了。",
      "先綁定群組，再建立活動，就能開始記帳。",
      "如果要設定自己的付款方式，請私聊我輸入 10。"
    ].join("\n");
  }

  if (event.type === "message" && event.message.type === "text") {
    return handleMessageEvent(event, appBaseUrl);
  }

  return null;
}
