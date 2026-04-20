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
  | { kind: "bind"; target: string }
  | { kind: "create-group"; name: string }
  | { kind: "create-group-help" }
  | { kind: "bind-help" }
  | { kind: "add-member"; names: string[] }
  | { kind: "add-member-help" }
  | { kind: "delete-member"; name: string }
  | { kind: "delete-member-help" }
  | { kind: "payment-settings-link"; name: string }
  | { kind: "payment-settings-help" }
  | { kind: "list-members" }
  | { kind: "delete-last-expense" }
  | { kind: "confirm-delete" }
  | { kind: "cancel-delete" }
  | { kind: "settlement" }
  | { kind: "recent-expenses" }
  | { kind: "help" }
  | { kind: "expense-help" }
  | { kind: "ignored" }
  | ParsedExpenseCommand;
