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
    const name = assertNonEmptyString(body.name, "請輸入成員名稱");

    const result = await db.$transaction(async (tx) => {
      const group = await tx.group.findUnique({
        where: {
          id: params.id
        }
      });

      if (!group) {
        return null;
      }

      const member = await tx.member.create({
        data: {
          name,
          groupId: params.id
        }
      });
      const activeLedger = await tx.ledger.findFirst({
        where: {
          groupId: params.id,
          isActive: true
        }
      });

      if (activeLedger?.isCollectingMembers) {
        await tx.ledgerParticipant.create({
          data: {
            ledgerId: activeLedger.id,
            memberId: member.id,
            displayName: member.name
          }
        });
      }

      return {
        member,
        joinedActiveLedger: Boolean(activeLedger?.isCollectingMembers)
      };
    });

    if (!result) {
      return fail("找不到這個群組。", 404);
    }

    return ok(
      {
        member: {
          id: result.member.id,
          name: result.member.name,
          paymentSettingsToken: null,
          createdAt: result.member.createdAt.toISOString(),
          paymentProfile: null
        },
        joinedActiveLedger: result.joinedActiveLedger
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return fail("這個群組裡已經有同名成員了。");
    }

    return fail(error instanceof Error ? error.message : "新增成員失敗。");
  }
}
