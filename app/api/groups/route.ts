import { createGroup } from "@/lib/group-service";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";

export async function GET() {
  const groups = await db.group.findMany({
    orderBy: {
      createdAt: "desc"
    },
    include: {
      _count: {
        select: {
          members: true,
          expenses: true
        }
      }
    }
  });

  return ok({
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      lineJoinCode: group.lineJoinCode,
      createdAt: group.createdAt.toISOString(),
      memberCount: group._count.members,
      expenseCount: group._count.expenses
    }))
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const group = await createGroup(body.name);

    return ok(
      {
        group: {
          id: group.id,
          name: group.name,
          lineJoinCode: group.lineJoinCode,
          createdAt: group.createdAt.toISOString(),
          memberCount: 0,
          expenseCount: 0
        }
      },
      { status: 201 }
    );
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "建立群組失敗，請稍後再試。"
    );
  }
}
