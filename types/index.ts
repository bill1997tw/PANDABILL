export type MemberPaymentProfileDto = {
  acceptBankTransfer: boolean;
  bankName: string | null;
  bankAccount: string | null;
  acceptLinePay: boolean;
  linePayId: string | null;
  acceptCash: boolean;
  paymentNote: string | null;
  hasAnyMethod: boolean;
};

export type GroupListItem = {
  id: string;
  name: string;
  lineJoinCode: string;
  createdAt: string;
  memberCount: number;
  expenseCount: number;
  ledgerCount: number;
  activeLedgerName: string | null;
};

export type LedgerDto = {
  id: string;
  groupId: string;
  name: string;
  status: "active" | "closed" | "archived";
  startedAt: string;
  endedAt: string | null;
  archivedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  expenseCount: number;
};

export type MemberDto = {
  id: string;
  name: string;
  paymentSettingsToken: string | null;
  createdAt: string;
  paymentProfile: MemberPaymentProfileDto | null;
};

export type ExpenseDto = {
  id: string;
  title: string;
  notes: string | null;
  amountCents: number;
  amountDisplay: string;
  createdAt: string;
  payer: {
    id: string;
    name: string;
  };
  participants: {
    id: string;
    shareCents: number;
    shareDisplay: string;
    member: {
      id: string;
      name: string;
    };
  }[];
};

export type MemberBalanceDto = {
  memberId: string;
  name: string;
  paidCents: number;
  owedCents: number;
  balanceCents: number;
  paidDisplay: string;
  owedDisplay: string;
  balanceDisplay: string;
};

export type SettlementDto = {
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  amountCents: number;
  amountDisplay: string;
  toMemberPaymentProfile?: MemberPaymentProfileDto | null;
};

export type GroupDetailDto = {
  group: {
    id: string;
    name: string;
    lineJoinCode: string;
    createdAt: string;
  };
  activeLedger: LedgerDto | null;
  ledgers: LedgerDto[];
  members: MemberDto[];
  expenses: ExpenseDto[];
  summary: {
    totalExpenseCents: number;
    totalExpenseDisplay: string;
    memberBalances: MemberBalanceDto[];
    settlement: SettlementDto[];
  };
};
