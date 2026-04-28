export type MenuMode = "xiaoer" | "settlement";

export function getXiaoerMenuText() {
  return [
    "小的來哩～請大人儘管吩咐～",
    "",
    "1. 建立活動：請直接輸入活動名稱",
    "2. 加入 + ／退出活動 -",
    "3. 確認成員：僅活動建立者",
    "4. 設定收款方式：私訊小二設定",
    "5. 新增支出",
    "6. 查看目前支出",
    "7. 刪除上一筆",
    "",
    "輸入【算帳】",
    "小二會繼續為大人服務～"
  ].join("\n");
}

export function getSettlementMenuText() {
  return "好勒~ 以下是小二能幫大人做的";
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
  return "請私聊我使用此功能";
}
