import { serializeLedger, switchActiveLedger } from "@/lib/ledger-service";
import { fail, ok } from "@/lib/http";

type Props = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, { params }: Props) {
  try {
    const body = await request.json();
    const result = await switchActiveLedger(params.id, body.name);

    return ok({
      ledger: serializeLedger(result.ledger),
      previousActiveName: result.previousActiveName
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "切換活動失敗。");
  }
}
