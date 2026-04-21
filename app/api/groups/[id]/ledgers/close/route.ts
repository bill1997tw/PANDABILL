import { closeActiveLedger, serializeLedger } from "@/lib/ledger-service";
import { ok } from "@/lib/http";

type Props = {
  params: {
    id: string;
  };
};

export async function POST(_: Request, { params }: Props) {
  const ledger = await closeActiveLedger(params.id);
  return ok({ ledger: ledger ? serializeLedger(ledger) : null });
}
