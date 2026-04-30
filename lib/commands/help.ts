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

export function getExpenseGuideText(useLegacyAlias = false) {
  const lines = [
    "請直接輸入支出內容：",
    "",
    "例如：",
    "",
    "晚餐600我付",
    "",
    "飲料185",
    "小明付",
    "100小華",
    "50小美",
    "35小明"
  ];

  if (!useLegacyAlias) {
    return lines.join("\n");
  }

  return ["請使用【新增支出】", "", ...lines].join("\n");
}

export function getPaymentSetupGuideText() {
  return "請私聊小二，並輸入【設定】哦～";
}
