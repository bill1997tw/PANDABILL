export function resolveSettlementShortcut(number: number) {
  if (number === 1) {
    return { kind: "current-settlement" } as const;
  }

  if (number === 2) {
    return { kind: "ledger-settlement" } as const;
  }

  if (number === 3) {
    return { kind: "mvp" } as const;
  }

  if (number === 4) {
    return { kind: "archive-ledger" } as const;
  }

  if (number === 5) {
    return { kind: "list-ledgers" } as const;
  }

  return { kind: "ignored" } as const;
}

export function resolvePersonalAccountingShortcut(number: number) {
  if (number === 1) {
    return { kind: "personal-ledger-start" } as const;
  }

  if (number === 2) {
    return { kind: "personal-ledger-current" } as const;
  }

  if (number === 3) {
    return { kind: "personal-ledger-details" } as const;
  }

  if (number === 4) {
    return { kind: "personal-ledger-delete-last" } as const;
  }

  if (number === 5) {
    return { kind: "personal-ledger-end" } as const;
  }

  if (number === 6) {
    return { kind: "personal-ledger-history" } as const;
  }

  return { kind: "ignored" } as const;
}

export function resolvePersonalAccountingNumericCommand(input: {
  chatType: "user" | "group" | "room";
  menuMode: "xiaoer" | "settlement" | "personal-accounting" | null;
  command: { kind: string; number?: number };
  hasPersonalPendingAction: boolean;
}) {
  if (
    input.hasPersonalPendingAction ||
    input.chatType !== "user" ||
    input.menuMode !== "personal-accounting" ||
    input.command.kind !== "shortcut" ||
    input.command.number === undefined
  ) {
    return null;
  }

  const resolved = resolvePersonalAccountingShortcut(input.command.number);
  return resolved.kind === "ignored" ? null : resolved;
}
