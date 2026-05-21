export function formatCurrentMembersLine(memberNames: string[]) {
  if (memberNames.length === 0) {
    return "目前尚未有報名成員";
  }

  return `目前成員：${memberNames.join("、")}`;
}

export function getCollectingMemberUpdateText(input: {
  type: "joined" | "left" | "already-joined" | "not-joined";
  actorName: string;
  activityName?: string;
  memberNames: string[];
}) {
  const activitySuffix = input.activityName ? `：${input.activityName}` : "";

  const header =
    input.type === "joined"
      ? `${input.actorName}已加入該活動${activitySuffix}`
      : input.type === "left"
        ? `${input.actorName}已退出該活動${activitySuffix}`
        : input.type === "already-joined"
          ? `${input.actorName}已經在本次活動名單中${activitySuffix}`
          : `${input.actorName}目前不在本次活動名單中${activitySuffix}`;

  return [header, formatCurrentMembersLine(input.memberNames)].join("\n");
}
