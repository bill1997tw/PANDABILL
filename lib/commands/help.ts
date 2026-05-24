export type MenuMode = "xiaoer" | "settlement";

export function getXiaoerMenuText() {
  return [
    "小的來哩～請大人儘管吩咐～",
    "",
    "1. 建立活動：請直接輸入活動名稱",
    "2. 加入 + ／退出活動 - 或手動新增/刪除成員",
    "3. 確認成員：僅活動建立者",
    "4. 設定收款方式：私訊小二設定",
    "5. 新增支出",
    "6. 查看目前支出",
    "7. 刪除支出"
  ].join("\n");
}

export function getSettlementMenuText() {
  return [
    "目前結算可直接輸入【算帳】查看。",
    "若要新增支出，請輸入【新增支出】查看語法。"
  ].join("\n");
}

export function getExpenseGuideText() {
  return [
    "可用語法：",
    "",
    "晚餐1000我付",
    "晚餐1000我付 小明 小華分",
    "晚餐1000我付400小明200小華",
    "",
    "多筆可用 / 分隔：",
    "",
    "晚餐1000我付 / 飲料500小華付"
  ].join("\n");
}

export function getPaymentSetupGuideText() {
  return "請私聊小二，並輸入【設定】哦～";
}
