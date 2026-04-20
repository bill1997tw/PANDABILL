import { getGroupDetail } from "@/lib/group-service";
import { fail, ok } from "@/lib/http";

type Props = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: Props) {
  const group = await getGroupDetail(params.id);

  if (!group) {
    return fail("找不到這個群組。", 404);
  }

  return ok(group);
}
