import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { assertNonEmptyString } from "@/lib/validators";

type Props = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, { params }: Props) {
  try {
    const body = await request.json();
    const name = assertNonEmptyString(body.name, "成員名稱");

    const group = await db.group.findUnique({
      where: {
        id: params.id
      }
    });

    if (!group) {
      return fail("找不到這個群組。", 404);
    }

    const member = await db.member.create({
      data: {
        name,
        groupId: params.id
      }
    });

    return ok(
      {
        member: {
          id: member.id,
          name: member.name,
          paymentSettingsToken: member.paymentSettingsToken,
          createdAt: member.createdAt.toISOString()
        }
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return fail("同一個群組內不能新增重複名稱的成員。");
    }

    return fail(
      error instanceof Error ? error.message : "新增成員失敗，請稍後再試。"
    );
  }
}
