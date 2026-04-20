import { Prisma } from "@prisma/client";

import { formatCents } from "@/lib/currency";
import { db } from "@/lib/db";
import {
  createExpenseInGroup,
  createGroup,
  formatExpenseLine,
  getRecentExpenses,
  getSettlementSnapshot
} from "@/lib/group-service";
import { parseLineCommand } from "@/lib/line/parser";
import { ensureMemberPaymentSettingsToken } from "@/lib/payment-settings-token";
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
    "3. 查看結算",
    "4. 查看最近支出",
    "5. 查看成員",
    "6. 刪除最後一筆支出",
    "7. 支出",
    "8. 新增成員：8阿明,小美,阿豪",
    "9. 刪除成員：9阿豪",
    "10. 付款設定連結：10阿豪 或 10全部"
  ].join("\n");
}

function createGroupHelpText() {
  return [
    "建立群組快打格式：",
    "1嘉義兩天一夜",
    "或",
    "建立群組 嘉義兩天一夜"
  ].join("\n");
}

function bindHelpText() {
  return [
    "綁定群組快打格式：",
    "2ABC123",
    "或",
    "綁定群組 ABC123"
  ].join("\n");
}

function addMemberHelpText() {
  return [
    "新增成員快打格式：",
    "8阿明,小美,阿豪",
    "或",
    "新增成員 阿明,小美,阿豪"
  ].join("\n");
}

function deleteMemberHelpText() {
  return [
    "刪除成員快打格式：",
    "9阿豪",
    "或",
    "刪除阿豪",
    "或",
    "刪除成員 阿豪"
  ].join("\n");
}

function paymentSettingsHelpText() {
  return [
    "付款設定連結格式：",
    "10阿豪",
    "10全部",
    "或",
    "付款設定 阿豪",
    "Bot 會回這位成員的專屬設定網址，或一次列出全部成員的設定網址。"
  ].join("\n");
}

function expenseHelpText() {
  return [
    "7 支出快打格式：",
    "完整格式：支出 晚餐 600 4人 阿明付款",
    "指定分攤：支出 晚餐 600 阿明付款 參與:阿明,小美,阿豪,小明",
    "全員快打：7飲料300三人阿豪",
    "省略人數：7芋圓300翔濠魚",
    "指定分攤：7芋圓300三人翔濠魚",
    "指定付款：7芋圓300濠付翔濠魚",
    "沒有寫「付」時，第一個名字會自動當付款人。"
  ].join("\n");
}

function paymentMethodsText(profile: {
  acceptBankTransfer: boolean;
  bankName: string | null;
  bankAccount: string | null;
  acceptLinePay: boolean;
  linePayId: string | null;
  acceptCash: boolean;
  paymentNote: string | null;
  hasAnyMethod: boolean;
} | null) {
  if (!profile || !profile.hasAnyMethod) {
    return ["收款方式", "尚未設定"].join("\n");
  }

  const lines: string[] = [];

  if (profile.acceptBankTransfer && profile.bankAccount) {
    lines.push("銀行轉帳");
    lines.push(
      `${[profile.bankName, profile.bankAccount].filter(Boolean).join(" / ")}`
    );
  }

  if (profile.acceptLinePay && profile.linePayId) {
    lines.push("LINE Pay");
    lines.push(profile.linePayId);
  }

  lines.push(profile.acceptCash ? "現金：可收" : "現金：不收");

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
    linePayId: string | null;
    acceptCash: boolean;
    paymentNote: string | null;
    hasAnyMethod: boolean;
  } | null;
}) {
  return [
    `${item.fromName} → ${item.toName}`,
    `金額：NT$ ${item.amountDisplay}`,
    paymentMethodsText(item.toMemberPaymentProfile ?? null)
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
    return "找不到可綁定的群組，請檢查綁定碼或群組名稱。";
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

  return `已綁定群組「${group.name}」。之後可直接用 7芋圓300翔濠魚 這種方式快速記帳。`;
}

async function handleAddMemberCommand(chatId: string, names: string[]) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "你還沒有綁定群組，請先輸入 2綁定碼 或 綁定群組 綁定碼。";
  }

  if (names.length === 0) {
    return "請輸入成員名稱，例如：8阿明,小美,阿豪";
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
    return `已新增成員：${createdNames.join("、")}\n以下已存在，這次略過：${skippedNames.join("、")}`;
  }

  return `已新增成員：${createdNames.join("、")}`;
}

async function handleDeleteMemberCommand(chatId: string, name: string) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "你還沒有綁定群組，請先輸入 2綁定碼 或 綁定群組 綁定碼。";
  }

  const targetName = name.trim();

  if (!targetName) {
    return "請輸入要刪除的成員名稱，例如：刪除阿豪";
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
    return `找不到成員「${targetName}」，請先用 5 查看成員名單。`;
  }

  if (member._count.paidExpenses > 0 || member._count.participations > 0) {
    return `成員「${member.name}」已經有支出或分攤紀錄，為了避免帳目錯亂，現在不能直接刪除。`;
  }

  await db.member.delete({
    where: {
      id: member.id
    }
  });

  return `已刪除成員：${member.name}`;
}

async function handlePaymentSettingsLinkCommand(
  chatId: string,
  name: string,
  appBaseUrl: string
) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "你還沒有綁定群組，請先輸入 2綁定碼 或 綁定群組 綁定碼。";
  }

  const targetName = name.trim();

  if (!targetName) {
    return "請輸入成員名稱，例如：10阿豪";
  }

  const normalizedBaseUrl = appBaseUrl.replace(/\/$/, "");

  if (targetName === "全部" || targetName.toLowerCase() === "all") {
    const members = await db.member.findMany({
      where: {
        groupId: binding.group.id
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    if (members.length === 0) {
      return `群組「${binding.group.name}」目前還沒有成員。`;
    }

    return [
      `群組「${binding.group.name}」付款設定連結：`,
      ...(
        await Promise.all(
          members.map(async (member) => {
            const token = await ensureMemberPaymentSettingsToken(member.id);
            return `${member.name}：${normalizedBaseUrl}/member-settings/${token}`;
          })
        )
      ),
      "把對應連結轉給本人即可。"
    ].join("\n");
  }

  const member = await db.member.findFirst({
    where: {
      groupId: binding.group.id,
      name: targetName
    }
  });

  if (!member) {
    return `找不到成員「${targetName}」，請先用 5 查看成員名單。`;
  }
  const token = await ensureMemberPaymentSettingsToken(member.id);
  const settingsUrl = `${normalizedBaseUrl}/member-settings/${token}`;

  return [
    `${member.name} 的付款設定連結：`,
    settingsUrl,
    "把這個連結直接傳給本人，他就能自己設定銀行、LINE Pay 與現金偏好。"
  ].join("\n");
}

async function handleListMembersCommand(chatId: string) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "你還沒有綁定群組，請先輸入 2綁定碼 或 綁定群組 綁定碼。";
  }

  if (binding.group.members.length === 0) {
    return `群組「${binding.group.name}」目前還沒有成員。`;
  }

  return [
    `群組「${binding.group.name}」成員如下：`,
    ...binding.group.members.map((member, index) => `${index + 1}. ${member.name}`)
  ].join("\n");
}

async function handleDeleteLastExpenseCommand(chatId: string) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "你還沒有綁定群組，請先輸入 2綁定碼 或 綁定群組 綁定碼。";
  }

  const latestExpense = await db.expense.findFirst({
    where: {
      groupId: binding.group.id
    },
    orderBy: {
      createdAt: "desc"
    },
    include: {
      payer: true
    }
  });

  if (!latestExpense) {
    return `群組「${binding.group.name}」目前沒有可刪除的支出。`;
  }

  await db.lineChatBinding.update({
    where: {
      chatId
    },
    data: {
      pendingDeleteExpenseId: latestExpense.id
    }
  });

  return `要刪除最後一筆支出嗎？\n${latestExpense.title}，NT$ ${formatCents(latestExpense.amountCents)}，${latestExpense.payer.name} 付款。\n回「是」或「Y」確認，回「否」取消。`;
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
      payer: true
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
    return "找不到要刪除的那筆支出，可能已經被刪掉了。";
  }

  await db.expense.delete({
    where: {
      id: expense.id
    }
  });

  return `已刪除最後一筆支出：${expense.title}，NT$ ${formatCents(expense.amountCents)}，${expense.payer.name} 付款。`;
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

async function handleExpenseCommand(
  chatId: string,
  command: ParsedExpenseCommand
) {
  const binding = await getBoundGroup(chatId);

  if (!binding) {
    return "你還沒有綁定群組，請先輸入 2綁定碼 或 綁定群組 綁定碼。";
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
      return "解析不到支出名單，請確認成員名稱都和群組內完全一致。";
    }

    participantNames = resolvedNames;
    participantCount = resolvedNames.length;

    if (!payerName) {
      payerName = resolvedNames[0];
    }
  }

  if (!payerName) {
    return "找不到付款人，請補上付款人名稱。";
  }

  const payer = memberMap.get(payerName.toLowerCase());

  if (!payer) {
    return `找不到付款人「${payerName}」，請先確認群組成員名單。`;
  }

  let participants = binding.group.members;

  if (participantNames?.length) {
    const resolved = participantNames.map((name) => memberMap.get(name.toLowerCase()));

    if (resolved.some((member) => !member)) {
      return "參與分攤成員有找不到的人名，請先確認群組成員名單。";
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
      return `目前群組共有 ${binding.group.members.length} 位成員。若不是全員分攤，請改用 7芋圓300翔濠魚 或 支出 晚餐 600 阿明付款 參與:阿明,小美。`;
    }
  }

  if (participantCount && participantCount !== participants.length) {
    return "你輸入的分攤人數和辨識到的成員數不一致，請重新確認。";
  }

  const expense = await createExpenseInGroup({
    groupId: binding.groupId,
    title: command.title,
    amount: command.amount,
    payerId: payer.id,
    participantIds: participants.map((member) => member.id),
    notes: "由 LINE Bot 建立"
  });

  const eachShare = expense.participants[0]?.shareDisplay ?? formatCents(0);

  return `支出已記錄：${expense.title}，總額 ${expense.amountDisplay}，${expense.participants.length} 人分攤，每人 ${eachShare}，付款人 ${expense.payer.name}。`;
}

async function handleMessageEvent(event: LineMessageEvent, appBaseUrl: string) {
  const { chatId, chatType, lineUserId } = getChatContext(event.source);

  if (!chatId) {
    return "抓不到這個聊天室的識別資訊，請稍後再試。";
  }

  const command = parseLineCommand(event.message.text);

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
    case "payment-settings-help":
      return paymentSettingsHelpText();
    case "expense-help":
      return expenseHelpText();
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

      return `群組「${group.name}」建立成功，並已自動綁定這個聊天室。\n綁定碼：${group.lineJoinCode}`;
    }
    case "bind":
      return bindGroup(chatId, chatType, lineUserId, command.target);
    case "add-member":
      return handleAddMemberCommand(chatId, command.names);
    case "delete-member":
      return handleDeleteMemberCommand(chatId, command.name);
    case "payment-settings-link":
      return handlePaymentSettingsLinkCommand(chatId, command.name, appBaseUrl);
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
        return "你還沒有綁定群組，請先輸入 2綁定碼 或 綁定群組 綁定碼。";
      }

      const summary = await getSettlementSnapshot(binding.groupId);

      if (!summary) {
        return "找不到這個群組的結算資料。";
      }

      if (summary.settlement.length === 0) {
        return `群組「${binding.group.name}」目前沒有待結算金額，大家已經打平。`;
      }

      return [
        `群組「${binding.group.name}」結算`,
        ...summary.settlement.map(
          (item) => formatSettlementLine(item)
        )
      ].join("\n\n");
    }
    case "recent-expenses": {
      const binding = await getBoundGroup(chatId);

      if (!binding) {
        return "你還沒有綁定群組，請先輸入 2綁定碼 或 綁定群組 綁定碼。";
      }

      const expenses = await getRecentExpenses(binding.groupId, 5);

      if (expenses.length === 0) {
        return `群組「${binding.group.name}」目前還沒有支出。`;
      }

      return [
        `群組「${binding.group.name}」最近支出：`,
        ...expenses.map(formatExpenseLine)
      ].join("\n");
    }
    case "expense":
      return handleExpenseCommand(chatId, command);
  }
}

export async function handleLineEvent(event: LineEvent, appBaseUrl: string) {
  if (event.type === "follow" || event.type === "join") {
    return "已連接記帳工具。\n輸入「小二」查看可用功能。";
  }

  if (event.type === "message" && event.message.type === "text") {
    return handleMessageEvent(event, appBaseUrl);
  }

  return null;
}
