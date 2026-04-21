import { archiveLedger, serializeLedger } from "@/lib/ledger-service";
import { fail, ok } from "@/lib/http";

type Props = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, { params }: Props) {
  try {
    const body = await request.json();
    const ledger = await archiveLedger(params.id, body.name);

    return ok({
      ledger: serializeLedger(ledger)
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "封存活動失敗。");
  }
}
