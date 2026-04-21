import { createLedgerForGroup, listLedgers, serializeLedger } from "@/lib/ledger-service";
import { fail, ok } from "@/lib/http";

type Props = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: Props) {
  const ledgers = await listLedgers(params.id);
  return ok({ ledgers: ledgers.map(serializeLedger) });
}

export async function POST(request: Request, { params }: Props) {
  try {
    const body = await request.json();
    const result = await createLedgerForGroup(params.id, body.name);

    return ok(
      {
        ledger: serializeLedger(result.ledger),
        previousActiveName: result.previousActiveName
      },
      { status: 201 }
    );
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "建立帳本失敗，請再試一次。"
    );
  }
}
