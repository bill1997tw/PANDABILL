export type MenuMode = "xiaoer" | "settlement";

export function getXiaoerMenuText() {
  return [
    "小的來哩～請大人儘管吩咐～",
    "",
    "1. 建立活動：請直接輸入活動名稱",
    "2. 加入 + ／退出活動 - 或手動新增成員",
    "3. 查看成員",
    "4. 確認成員：僅活動建立者",
    "5. 設定收款方式：私訊小二設定",
    "6. 新增支出",
    "7. 查看目前支出",
    "8. 刪除上一筆",
    "",
    "輸入【算帳】",
    "小二會繼續為大人服務～"
  ].join("\n");
}

export function getSettlementMenuText() {
  return [
    "好勒~ 以下是小二能幫大人做的",
    "",
    "1. 查看目前結算",
    "2. 帳本結算",
    "3. 代墊 MVP",
    "4. 查看封存帳本",
    "5. 結束活動並封存帳本",
    "",
    "請輸入數字 1～5"
  ].join("\n");
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
    "35小陳"
  ];

  if (!useLegacyAlias) {
    return lines.join("\n");
  }

  return ["請使用【新增支出】", "", ...lines].join("\n");
}

export function getPaymentSetupGuideText() {
  return "請私聊小二，並輸入【設定】哦～";
}
