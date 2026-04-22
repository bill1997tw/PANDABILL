import { formatCurrentMembersLine } from "@/lib/commands/participant-roster";

type ActivityListItem = {
  name: string;
  isActive: boolean;
  status: "active" | "closed" | "archived";
};

export function getCollectingMembersPrompt(activityName: string, memberNames: string[]) {
  return [
    `已建立活動：${activityName}`,
    formatCurrentMembersLine(memberNames),
    "",
    "其他人可輸入：",
    "+ / +1 加入",
    "- / -1 退出",
    "",
    "全部確認後請輸入：確認成員"
  ].join("\n");
}

export function getConfirmedMembersPrompt(activityName: string, memberNames: string[]) {
  return [
    `已確認本次活動成員：${activityName}`,
    ...memberNames.map((name, index) => `${index + 1}. ${name}`),
    "現在可以開始記帳"
  ].join("\n");
}

export function getLedgerListText(items: ActivityListItem[]) {
  if (items.length === 0) {
    return "目前還沒有任何活動帳本。";
  }

  const active = items.find((item) => item.isActive);
  const recentClosed = items.filter((item) => item.status === "closed").slice(0, 3);
  const archived = items.filter((item) => item.status === "archived");

  const lines: string[] = ["帳本列表"];

  lines.push(active ? `目前進行中：${active.name}` : "目前進行中：沒有");

  if (recentClosed.length > 0) {
    lines.push("最近結束：");
    lines.push(...recentClosed.map((item) => `- ${item.name}`));
  }

  if (archived.length > 0) {
    lines.push(`已封存：${archived.slice(0, 3).map((item) => item.name).join("、")}`);
    if (archived.length > 3) {
      lines.push(`還有 ${archived.length - 3} 本封存帳本`);
    }
  }

  return lines.join("\n");
}

export function getNoActiveLedgerText() {
  return "目前沒有進行中的帳本，請先輸入：建立活動 活動名稱";
}
