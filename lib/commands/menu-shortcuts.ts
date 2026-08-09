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
