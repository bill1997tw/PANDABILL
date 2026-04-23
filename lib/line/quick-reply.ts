export type LineQuickReplyAction = {
  type: "message";
  label: string;
  text: string;
};

export type LineQuickReplyItem = {
  type: "action";
  action: LineQuickReplyAction;
};

export type LineQuickReply = {
  items: LineQuickReplyItem[];
};

type QuickReplyOption = {
  label: string;
  text: string;
};

function buildQuickReply(options: QuickReplyOption[]): LineQuickReply {
  return {
    items: options.map((option) => ({
      type: "action",
      action: {
        type: "message",
        label: option.label,
        text: option.text
      }
    }))
  };
}

export function buildAssistantQuickReply() {
  return buildQuickReply([
    { label: "建立活動", text: "建立活動" },
    { label: "確認成員", text: "確認成員" },
    { label: "設定收款", text: "設定收款方式" },
    { label: "支出", text: "支出" },
    { label: "查看支出", text: "查看支出" },
    { label: "刪除最近一筆", text: "刪除最近一筆支出" }
  ]);
}

export function buildSettlementQuickReply() {
  return buildQuickReply([
    { label: "帳本結算", text: "帳本結算" },
    { label: "代墊MVP", text: "代墊MVP" },
    { label: "結束並封存", text: "結束活動同時封存帳本" },
    { label: "查看封存帳本", text: "查看封存帳本" }
  ]);
}

export function buildActivityCreatedQuickReply() {
  return buildQuickReply([
    { label: "確認成員", text: "確認成員" },
    { label: "查看成員", text: "查看成員" },
    { label: "查看支出", text: "查看支出" },
    { label: "算帳", text: "算帳" }
  ]);
}

export function buildActivityConfirmedQuickReply() {
  return buildQuickReply([
    { label: "支出", text: "支出" },
    { label: "查看支出", text: "查看支出" },
    { label: "帳本結算", text: "帳本結算" },
    { label: "代墊MVP", text: "代墊MVP" }
  ]);
}

export function buildExpenseQuickReply() {
  return buildQuickReply([
    { label: "支出", text: "支出" },
    { label: "刪除最近一筆", text: "刪除最近一筆支出" },
    { label: "帳本結算", text: "帳本結算" }
  ]);
}

export function buildSettlementResultQuickReply() {
  return buildQuickReply([
    { label: "查看支出", text: "查看支出" },
    { label: "結束並封存", text: "結束活動同時封存帳本" },
    { label: "查看封存帳本", text: "查看封存帳本" },
    { label: "小二", text: "小二" }
  ]);
}

export function buildArchivedLedgerQuickReply() {
  return buildQuickReply([
    { label: "帳本結算", text: "帳本結算" },
    { label: "小二", text: "小二" }
  ]);
}
