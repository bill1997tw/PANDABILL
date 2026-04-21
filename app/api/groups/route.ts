import { createGroup, getGroupListData } from "@/lib/group-service";
import { fail, ok } from "@/lib/http";

export async function GET() {
  const groups = await getGroupListData();
  return ok({ groups });
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
          expenseCount: 0,
          ledgerCount: 0,
          activeLedgerName: null
        }
      },
      { status: 201 }
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "建立群組失敗。");
  }
}
