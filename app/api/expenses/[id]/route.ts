import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";

type Props = {
  params: {
    id: string;
  };
};

export async function DELETE(_: Request, { params }: Props) {
  const existing = await db.expense.findUnique({
    where: {
      id: params.id
    }
  });

  if (!existing) {
    return fail("找不到這筆支出。", 404);
  }

  await db.expense.delete({
    where: {
      id: params.id
    }
  });

  return ok({ success: true });
}
