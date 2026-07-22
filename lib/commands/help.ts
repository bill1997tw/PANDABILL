export type MenuMode = "xiaoer" | "settlement";

export function getXiaoerMenuText() {
  return [
    "小二來哩～請大人儘管吩咐~我會...",
    "",
    "1. 建立活動：請直接輸入活動名稱",
    "2. 加入 + ／退出活動 - 或手動新增/刪除成員",
    "3. 確認成員：僅活動建立者",
    "4. 設定收款方式：私訊小二設定",
    "5. 新增支出",
    "6. 查看目前支出",
    "7. 刪除支出",
    "",
    "或是大人需要【算帳】也沒有問題~"
  ].join("\n");
}

export function getSettlementMenuText() {
  return [
    "大人您要結帳了嗎?~小二聽您差遣~您需要...",
    "",
    "1. 查看目前結算",
    "2. 帳本結算",
    "3. 代墊 MVP",
    "4. 結束活動並封存帳本"
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
    "品項含數字時，請在品項與金額間空一格：",
    "3COINS 13400周永濠付",
    "",
    "多筆可用 / 分隔：",
    "",
    "晚餐1000我付 / 飲料500小華付",
    "",
    "中途還款：",
    "還款13740周永濠給翔翔"
  ].join("\n");
}

export function getPaymentSetupGuideText() {
  return "請私聊小二，並輸入【設定】哦～";
}
