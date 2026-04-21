export type LineMessageEvent = {
  type: "message";
  replyToken?: string;
  source: {
    type: "user" | "group" | "room";
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
  message: {
    id: string;
    type: "text";
    text: string;
  };
};

export type LineEvent =
  | LineMessageEvent
  | {
      type: "follow" | "join";
      replyToken?: string;
      source: {
        type: "user" | "group" | "room";
        userId?: string;
        groupId?: string;
        roomId?: string;
      };
    };

export type LineWebhookBody = {
  destination: string;
  events: LineEvent[];
};

export type ParsedExpenseCommand = {
  kind: "expense";
  title: string;
  amount: string;
  payerName?: string;
  participantCount?: number;
  participantNames?: string[];
  compactMemberBlob?: string;
};

export type ParsedLineCommand =
  | { kind: "help" }
  | { kind: "ignored" }
  | { kind: "create-group"; name: string }
  | { kind: "create-group-help" }
  | { kind: "bind"; target: string }
  | { kind: "bind-help" }
  | { kind: "add-member"; names: string[] }
  | { kind: "add-member-help" }
  | { kind: "delete-member"; name: string }
  | { kind: "delete-member-help" }
  | { kind: "list-members" }
  | { kind: "delete-last-expense" }
  | { kind: "confirm-delete" }
  | { kind: "cancel-delete" }
  | { kind: "settlement" }
  | { kind: "recent-expenses" }
  | { kind: "expense-help" }
  | { kind: "create-ledger"; name: string }
  | { kind: "switch-ledger"; name: string }
  | { kind: "current-ledger" }
  | { kind: "list-ledgers" }
  | { kind: "close-ledger" }
  | { kind: "archive-ledger"; name: string }
  | { kind: "list-archived-ledgers" }
  | { kind: "start-payment-setup" }
  | { kind: "view-my-payment-settings" }
  | { kind: "identify-self"; name: string }
  | { kind: "cancel-payment-setup" }
  | ParsedExpenseCommand;
