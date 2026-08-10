import { personalLedgerRepository } from "@/lib/personal-ledger/repository";
import { createPersonalLedgerService } from "@/lib/personal-ledger/service-core";

export { createPersonalLedgerService } from "@/lib/personal-ledger/service-core";

export const personalLedgerService = createPersonalLedgerService(
  personalLedgerRepository
);
