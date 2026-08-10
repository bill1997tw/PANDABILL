import { MenuContextType } from "@prisma/client";

import type { MenuMode } from "@/lib/commands/help";
import { db } from "@/lib/db";

const MENU_CONTEXT_TTL_MINUTES = 5;

function getExpiresAt() {
  return new Date(Date.now() + MENU_CONTEXT_TTL_MINUTES * 60 * 1000);
}

function toMenuContextType(mode: MenuMode): MenuContextType {
  if (mode === "xiaoer") {
    return MenuContextType.xiaoer;
  }

  return mode === "settlement"
    ? MenuContextType.settlement
    : MenuContextType.personal_accounting;
}

export async function rememberMenuContext(input: {
  chatId: string;
  lineUserId?: string;
  groupId?: string | null;
  mode: MenuMode;
}) {
  if (!input.lineUserId) {
    return;
  }

  await db.menuContext.upsert({
    where: {
      chatId_requesterLineUserId: {
        chatId: input.chatId,
        requesterLineUserId: input.lineUserId
      }
    },
    update: {
      groupId: input.groupId ?? null,
      menuType: toMenuContextType(input.mode),
      expiresAt: getExpiresAt()
    },
    create: {
      groupId: input.groupId ?? null,
      chatId: input.chatId,
      requesterLineUserId: input.lineUserId,
      menuType: toMenuContextType(input.mode),
      expiresAt: getExpiresAt()
    }
  });
}

export async function getActiveMenuContext(chatId: string, lineUserId?: string) {
  if (!lineUserId) {
    return null;
  }

  await db.menuContext.deleteMany({
    where: {
      chatId,
      expiresAt: {
        lt: new Date()
      }
    }
  });

  return db.menuContext.findUnique({
    where: {
      chatId_requesterLineUserId: {
        chatId,
        requesterLineUserId: lineUserId
      }
    }
  });
}

export async function clearMenuContext(chatId: string, lineUserId?: string) {
  if (!lineUserId) {
    return;
  }

  await db.menuContext.deleteMany({
    where: {
      chatId,
      requesterLineUserId: lineUserId
    }
  });
}

export function resolveMenuModeFromContext(
  context: Awaited<ReturnType<typeof getActiveMenuContext>>
) {
  if (!context) {
    return null;
  }

  if (context.menuType === MenuContextType.xiaoer) {
    return "xiaoer";
  }

  return context.menuType === MenuContextType.settlement
    ? "settlement"
    : "personal-accounting";
}

export function getMenuContextExpiredPrompt() {
  return "請先輸入「小二」、「算帳」或「記帳」，小二才知道大人要使用哪一套功能。";
}
