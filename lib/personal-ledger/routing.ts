export function shouldRoutePersonalExpense(input: {
  chatType: "user" | "group" | "room";
  menuMode: "xiaoer" | "settlement" | "personal-accounting" | null;
  hasActiveLedger: boolean;
}) {
  return (
    input.chatType === "user" &&
    input.menuMode === "personal-accounting" &&
    input.hasActiveLedger
  );
}
