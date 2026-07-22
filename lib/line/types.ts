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

export type ParsedLineCommand =
  | { kind: "ignored" }
  | { kind: "menu-context-required" }
  | { kind: "shortcut"; number: number; payload?: string }
  | { kind: "xiaoer-help" }
  | { kind: "settlement-help" }
  | { kind: "current-settlement" }
  | { kind: "ledger-settlement" }
  | { kind: "mvp" }
  | { kind: "member-management-help" }
  | { kind: "current-ledger" }
  | { kind: "list-ledgers" }
  | { kind: "switch-ledger-help" }
  | { kind: "switch-ledger"; name: string }
  | { kind: "close-ledger" }
  | { kind: "archive-ledger"; name?: string }
  | { kind: "create-ledger-help" }
  | { kind: "create-ledger"; name: string }
  | { kind: "join-activity" }
  | { kind: "leave-activity" }
  | { kind: "add-members"; names: string[] }
  | { kind: "remove-member"; name: string }
  | { kind: "confirm-members" }
  | { kind: "cancel" }
  | { kind: "delete-last-expense" }
  | { kind: "recent-expenses" }
  | { kind: "expense-help" }
  | { kind: "start-payment-setup" }
  | { kind: "view-payment-settings" };
