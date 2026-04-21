export type MenuMode = "xiaoer" | "settlement";

export function getXiaoerMenuText() {
  return [
    "小的來哩～大人有什麼吩咐~",
    "1【建立活動】",
    "2【確認成員】",
    "3【私聊設定收款方式】",
    "4【支出】",
    "5【查看支出】",
    "6【刪除最近一筆支出】"
  ].join("\n");
}

export function getSettlementMenuText() {
  return [
    "好勒~ 以下是小二能幫大人做的",
    "1【帳本結算】",
    "2【代墊MVP】",
    "3【結束活動同時封存帳本】",
    "4【查看封存帳本】"
  ].join("\n");
}

export function getExpenseGuideText() {
  return [
    "可以這樣記帳：",
    "- 晚餐 2000 阿豪付",
    "- 我付了晚餐2000",
    "- 阿明付計程車300",
    "- 飲料150小美付",
    "- 午餐 600 3人分 阿豪付"
  ].join("\n");
}

export function getPaymentSetupGuideText() {
  return "請私聊我使用此功能。";
}
