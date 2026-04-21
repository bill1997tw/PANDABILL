import { getActiveLedger, serializeLedger } from "@/lib/ledger-service";
import { ok } from "@/lib/http";

type Props = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: Props) {
  const activeLedger = await getActiveLedger(params.id);
  return ok({
    activeLedger: activeLedger ? serializeLedger(activeLedger) : null
  });
}
