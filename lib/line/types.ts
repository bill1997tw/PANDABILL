export type LineEventSource = {
  type: "user" | "group" | "room";
  userId?: string;
  groupId?: string;
  roomId?: string;
};

export type LineMessageEvent = {
  type: "message";
  replyToken?: string;
  source: LineEventSource;
  message: {
    id: string;
    type: "text";
    text: string;
  };
};

export type LineJoinLikeEvent = {
  type: "follow" | "join";
  replyToken?: string;
  source: LineEventSource;
};

export type LineEvent = LineMessageEvent | LineJoinLikeEvent;

export type LineWebhookBody = {
  destination: string;
  events: LineEvent[];
};

export type ParsedExpenseCommand = {
  kind: "expense";
  title: string;
  amount: string;
  payerName?: string;
  payerIsSender?: boolean;
  participantCount?: number;
};

export type ParsedLineCommand =
  | { kind: "ignored" }
  | { kind: "menu-context-required" }
  | { kind: "xiaoer-help" }
  | { kind: "settlement-help" }
  | { kind: "create-ledger-help" }
  | { kind: "shortcut"; number: number; payload?: string }
  | { kind: "join-activity" }
  | { kind: "leave-activity" }
  | { kind: "confirm-members" }
  | { kind: "list-members" }
  | { kind: "confirm" }
  | { kind: "cancel" }
  | { kind: "create-ledger"; name: string }
  | { kind: "switch-ledger"; name: string }
  | { kind: "current-ledger" }
  | { kind: "reset-ledger" }
  | { kind: "group-info" }
  | { kind: "list-ledgers" }
  | { kind: "close-ledger" }
  | { kind: "archive-ledger"; name: string }
  | { kind: "list-archived-ledgers" }
  | { kind: "delete-last-expense" }
  | { kind: "settlement" }
  | { kind: "mvp" }
  | { kind: "recent-expenses" }
  | { kind: "expense-help" }
  | { kind: "create-group"; name: string }
  | { kind: "bind"; target: string }
  | { kind: "identify-self"; name: string }
  | { kind: "start-payment-setup" }
  | ParsedExpenseCommand;
