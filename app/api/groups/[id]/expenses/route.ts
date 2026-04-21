import { createExpenseInGroup } from "@/lib/group-service";
import { fail, ok } from "@/lib/http";

type Props = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, { params }: Props) {
  try {
    const body = await request.json();
    const result = await createExpenseInGroup({
      groupId: params.id,
      title: body.title,
      amount: body.amount,
      payerId: body.payerId,
      participantIds: body.participantIds,
      notes: body.notes
    });

    return ok(result, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "找不到這個群組。" ||
        error.message === "目前沒有進行中的帳本，請先輸入：建立活動 活動名稱")
    ) {
      return fail(error.message, 404);
    }

    return fail(
      error instanceof Error ? error.message : "新增支出失敗，請再試一次。"
    );
  }
}
