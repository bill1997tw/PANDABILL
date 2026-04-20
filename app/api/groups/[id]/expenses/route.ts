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
    const expense = await createExpenseInGroup({
      groupId: params.id,
      title: body.title,
      amount: body.amount,
      payerId: body.payerId,
      participantIds: body.participantIds,
      notes: body.notes
    });

    return ok({ expense }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "找不到這個群組。") {
      return fail(error.message, 404);
    }

    return fail(
      error instanceof Error ? error.message : "新增支出失敗，請稍後再試。"
    );
  }
}
