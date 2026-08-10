export class PersonalLedgerAlreadyActiveError extends Error {
  constructor() {
    super("A personal ledger is already active for this LINE user.");
  }
}
