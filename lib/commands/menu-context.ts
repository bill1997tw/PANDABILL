import { MenuContextType } from "@prisma/client";

import { db } from "@/lib/db";
import type { MenuMode } from "@/lib/commands/help";

const MENU_CONTEXT_TTL_MINUTES = 5;

function getExpiresAt() {
  return new Date(Date.now() + MENU_CONTEXT_TTL_MINUTES * 60 * 1000);
}

function toMenuContextType(mode: MenuMode): MenuContextType {
  return mode === "xiaoer" ? MenuContextType.xiaoer : MenuContextType.settlement;
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

export function resolveMenuModeFromContext(
  context: Awaited<ReturnType<typeof getActiveMenuContext>>
): MenuMode | null {
  if (!context) {
    return null;
  }

  return context.menuType === MenuContextType.xiaoer ? "xiaoer" : "settlement";
}

export function getMenuContextExpiredPrompt() {
  return "請先輸入「小二」或「算帳」，小二才知道大人現在要用哪一套選單。";
}
