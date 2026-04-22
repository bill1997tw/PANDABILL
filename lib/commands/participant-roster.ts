export function formatCurrentMembersLine(memberNames: string[]) {
  if (memberNames.length === 0) {
    return "目前尚未有報名成員";
  }

  return `目前成員：${memberNames.join("、")}`;
}

export function getCollectingMemberUpdateText(input: {
  type: "joined" | "left" | "already-joined" | "not-joined";
  actorName: string;
  memberNames: string[];
}) {
  const header =
    input.type === "joined"
      ? `${input.actorName}已加入本次活動`
      : input.type === "left"
        ? `${input.actorName}已退出本次活動`
        : input.type === "already-joined"
          ? "你已經在本次活動名單中"
          : "你目前不在本次活動名單中";

  return [header, formatCurrentMembersLine(input.memberNames)].join("\n");
}
