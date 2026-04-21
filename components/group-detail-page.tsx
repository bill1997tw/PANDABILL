"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { Toast } from "@/components/toast";
import { parseJson } from "@/lib/api";
import type {
  ExpenseDto,
  GroupDetailDto,
  LedgerDto,
  MemberBalanceDto,
  MemberPaymentProfileDto,
  SettlementDto
} from "@/types";

type GroupDetailPageProps = {
  groupId: string;
};

type SettlementResponse = {
  memberStats: MemberBalanceDto[];
  memberBalances: MemberBalanceDto[];
  balances: {
    memberId: string;
    name: string;
    balanceCents: number;
    balanceDisplay: string;
  }[];
  transfers: SettlementDto[];
  settlement: SettlementDto[];
  totalExpenseDisplay: string;
};

export function GroupDetailPage({ groupId }: GroupDetailPageProps) {
  const [data, setData] = useState<GroupDetailDto | null>(null);
  const [settlement, setSettlement] = useState<SettlementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [memberName, setMemberName] = useState("");
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    title: "",
    amount: "",
    payerId: "",
    participantIds: [] as string[],
    notes: ""
  });

  async function loadGroup() {
    setLoading(true);
    setError(null);

    try {
      const [groupData, settlementData] = await Promise.all([
        parseJson<GroupDetailDto>(
          await fetch(`/api/groups/${groupId}`, {
            cache: "no-store"
          })
        ),
        parseJson<SettlementResponse>(
          await fetch(`/api/groups/${groupId}/settlement`, {
            cache: "no-store"
          })
        )
      ]);

      setData(groupData);
      setSettlement(settlementData);

      if (!expenseForm.payerId && groupData.members[0]) {
        setExpenseForm((current) => ({
          ...current,
          payerId: groupData.members[0].id,
          participantIds: groupData.members.map((member) => member.id)
        }));
      }
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "讀取群組資料失敗。"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadGroup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const members = data?.members ?? [];
  const expenses = data?.expenses ?? [];
  const canCreateExpense = members.length > 0;
  const totalExpenseDisplay = settlement?.totalExpenseDisplay ?? "0.00";
  const activeLedger = data?.activeLedger ?? null;
  const ledgers = data?.ledgers ?? [];

  const selectedParticipants = useMemo(
    () => new Set(expenseForm.participantIds),
    [expenseForm.participantIds]
  );

  async function handleAddMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMemberSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      await parseJson(
        await fetch(`/api/groups/${groupId}/members`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name: memberName })
        })
      );

      setMemberName("");
      setNotice("成員新增成功。");
      await loadGroup();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "新增成員失敗。"
      );
    } finally {
      setMemberSubmitting(false);
    }
  }

  async function handleAddExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExpenseSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      await parseJson(
        await fetch(`/api/groups/${groupId}/expenses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(expenseForm)
        })
      );

      setExpenseForm({
        title: "",
        amount: "",
        payerId: members[0]?.id ?? "",
        participantIds: members.map((member) => member.id),
        notes: ""
      });
      setNotice("支出新增成功。");
      await loadGroup();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "新增支出失敗。"
      );
    } finally {
      setExpenseSubmitting(false);
    }
  }

  async function handleDeleteExpense(expenseId: string) {
    const confirmed = window.confirm("確定要刪除這筆支出嗎？此操作無法復原。");

    if (!confirmed) {
      return;
    }

    setError(null);
    setNotice(null);

    try {
      await parseJson(
        await fetch(`/api/expenses/${expenseId}`, {
          method: "DELETE"
        })
      );
      setNotice("支出已刪除。");
      await loadGroup();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "刪除支出失敗。"
      );
    }
  }

  function toggleParticipant(memberId: string) {
    setExpenseForm((current) => {
      const hasMember = current.participantIds.includes(memberId);
      const nextIds = hasMember
        ? current.participantIds.filter((id) => id !== memberId)
        : [...current.participantIds, memberId];

      return {
        ...current,
        participantIds: nextIds
      };
    });
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/" className="text-sm font-medium text-accent">
            ← 回到群組列表
          </Link>
          <h1 className="mt-2 text-3xl font-semibold text-ink">
            {data?.group.name ?? "群組詳情"}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {data?.group.createdAt
              ? `建立於 ${new Date(data.group.createdAt).toLocaleString("zh-TW")}`
              : "正在載入群組資訊..."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="#expense-form"
            className="hidden rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-soft hover:bg-accent/90 sm:inline-flex"
          >
            ＋ 新增支出
          </a>
          <div className="rounded-3xl border border-white/70 bg-white/80 px-5 py-4 shadow-soft">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              1. 群組名稱
            </p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {data?.group.name ?? "載入中"}
            </p>
            <p className="mt-2 text-sm font-medium text-ink">
              目前帳本：{activeLedger?.name ?? "尚未建立"}
            </p>
            <p className="mt-1 text-sm text-slate-500">總支出 NT$ {totalExpenseDisplay}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          {error ? <Toast message={error} /> : null}
          {notice ? <Toast tone="success" message={notice} /> : null}

          <SectionCard
            title="2. 成員列表"
            description="群組內負責分帳的人名單。付款方式請每位成員自行私聊 Bot 輸入「10」或「設定收款」設定，之後新群組也會沿用。"
          >
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleAddMember}>
              <input
                value={memberName}
                onChange={(event) => setMemberName(event.target.value)}
                placeholder="輸入成員名稱"
                maxLength={30}
              />
              <button
                type="submit"
                disabled={memberSubmitting}
                className="rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {memberSubmitting ? "新增中..." : "新增成員"}
              </button>
            </form>

            <div className="mt-4 flex flex-wrap gap-3">
              {members.length === 0 ? (
                <p className="text-sm text-slate-500">目前還沒有成員。</p>
              ) : (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="rounded-full border border-line bg-mist px-4 py-2 text-sm font-medium text-ink"
                  >
                    {member.name}
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 rounded-3xl border border-dashed border-line bg-mist px-4 py-4 text-sm leading-6 text-slate-600">
              <p className="font-semibold text-ink">付款方式設定改成私聊 Bot</p>
              <p className="mt-2">
                每位成員只要私聊 Bot 輸入 <span className="font-semibold text-ink">10</span>、
                <span className="font-semibold text-ink">設定收款</span> 或
                <span className="font-semibold text-ink">更改付款方式</span>，
                就能設定自己的銀行、LINE Pay 是否可收、現金是否可收。設定一次，之後新群組也會沿用。
              </p>
            </div>
          </SectionCard>

          <SectionCard
            title="活動帳本"
            description="同一個群組可以有很多本帳，但同時間只會有一本是目前進行中。LINE 群組裡可用「建立活動」、「切換活動」、「結束活動」、「封存帳本」。"
          >
            {ledgers.length === 0 ? (
              <EmptyState
                title="目前還沒有活動帳本"
                description="請在 LINE 群組輸入：建立活動 活動名稱"
              />
            ) : (
              <div className="space-y-3">
                {ledgers.map((ledger) => (
                  <LedgerItem key={ledger.id} ledger={ledger} />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            action={
              <span className="rounded-full bg-mist px-3 py-1 text-xs font-semibold text-slate-500">
                5 步驟快速記帳
              </span>
            }
            title="3. 新增支出表單"
            description="預設平均分攤，系統會自動處理小數與尾差，最後統一顯示到小數點後兩位。"
          >
            {!canCreateExpense ? (
              <EmptyState
                title="還不能新增支出"
                description="請先建立至少一位成員，才能開始記帳。"
              />
            ) : (
              activeLedger ? (
                <form
                  id="expense-form"
                  className="scroll-mt-24 space-y-4"
                  onSubmit={handleAddExpense}
                >
                  <div className="rounded-2xl bg-mist px-4 py-3 text-sm text-slate-600">
                    目前會記到帳本：<span className="font-semibold text-ink">{activeLedger.name}</span>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-ink">
                        1. 用途
                      </label>
                      <input
                        value={expenseForm.title}
                        onChange={(event) =>
                          setExpenseForm((current) => ({
                            ...current,
                            title: event.target.value
                          }))
                        }
                        placeholder="例如：晚餐"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-ink">
                        2. 金額
                      </label>
                      <input
                        inputMode="decimal"
                        value={expenseForm.amount}
                        onChange={(event) =>
                          setExpenseForm((current) => ({
                            ...current,
                            amount: event.target.value
                          }))
                        }
                        placeholder="例如：600 或 128.50"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-ink">
                        3. 付款人
                      </label>
                      <select
                        value={expenseForm.payerId}
                        onChange={(event) =>
                          setExpenseForm((current) => ({
                            ...current,
                            payerId: event.target.value
                          }))
                        }
                      >
                        <option value="">請選擇付款人</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-ink">
                        備註
                      </label>
                      <input
                        value={expenseForm.notes}
                        onChange={(event) =>
                          setExpenseForm((current) => ({
                            ...current,
                            notes: event.target.value
                          }))
                        }
                        placeholder="可選填，例如：居酒屋二次會"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="block text-sm font-medium text-ink">
                        4. 分攤成員
                      </label>
                      <span className="text-xs text-slate-500">至少勾選 1 人</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {members.map((member) => (
                        <label
                          key={member.id}
                          className="flex items-center gap-3 rounded-2xl border border-line bg-mist px-4 py-3"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-line"
                            checked={selectedParticipants.has(member.id)}
                            onChange={() => toggleParticipant(member.id)}
                          />
                          <span className="text-sm text-ink">{member.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={expenseSubmitting}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-accent px-4 py-4 text-base font-semibold text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {expenseSubmitting ? "送出中..." : "5. 送出支出"}
                  </button>
                </form>
              ) : (
                <EmptyState
                  title="目前沒有進行中的帳本"
                  description="請先在 LINE 群組輸入：建立活動 活動名稱。建立後，這裡的新支出才會記到正確帳本。"
                />
              )
            )}
          </SectionCard>

          <SectionCard
            title="4. 支出清單"
            description="列出群組內所有支出，可直接刪除錯誤紀錄。"
          >
            {loading ? (
              <p className="text-sm text-slate-500">載入中...</p>
            ) : expenses.length === 0 ? (
              <EmptyState
                title="目前沒有支出"
                description={
                  activeLedger
                    ? `新增第一筆支出後，這裡會顯示「${activeLedger.name}」的完整紀錄與分攤成員。`
                    : "目前沒有進行中的帳本，請先建立活動。"
                }
              />
            ) : (
              <div className="space-y-4">
                {expenses.map((expense) => (
                  <ExpenseItem
                    key={expense.id}
                    expense={expense}
                    onDelete={() => handleDeleteExpense(expense.id)}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            title="5. 成員結算摘要"
            description="已付代表先墊付的總額，應付代表參與分攤的總額，差額為最終淨額。"
          >
            {settlement?.memberStats.length ? (
              <div className="space-y-3">
                {settlement.memberStats.map((member) => {
                  const toneClass =
                    member.balanceCents > 0
                      ? "text-accent"
                      : member.balanceCents < 0
                        ? "text-danger"
                        : "text-slate-500";

                  return (
                    <div
                      key={member.memberId}
                      className="rounded-3xl border border-line bg-mist p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-ink">{member.name}</p>
                          <p className="mt-2 text-sm text-slate-500">
                            總付款 NT$ {member.paidDisplay}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            總應分攤 NT$ {member.owedDisplay}
                          </p>
                        </div>
                        <p className={`text-base font-semibold ${toneClass}`}>
                          {member.balanceCents > 0
                            ? `最終餘額：應收 NT$ ${member.balanceDisplay}`
                            : member.balanceCents < 0
                              ? `最終餘額：應付 NT$ ${member.balanceDisplay.replace("-", "")}`
                              : "最終餘額：剛好打平"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="尚未產生收支統計"
                description="加入成員並新增支出後，就會看到每個人的收支狀況。"
              />
            )}
          </SectionCard>

          <SectionCard
            title="6. 最終誰該付誰"
            description="系統會把債務關係整理成較少筆轉帳。銀行帳號會完整顯示，方便在手機直接複製貼上。"
          >
            {settlement?.transfers.length ? (
              <div className="space-y-3">
                {settlement.transfers.map((item) => (
                  <div
                    key={`${item.fromMemberId}-${item.toMemberId}`}
                    className="rounded-3xl border border-line bg-white p-4"
                  >
                    <p className="text-sm text-slate-500">建議轉帳</p>
                    <p className="mt-2 text-base font-semibold text-ink">
                      {item.fromName} → {item.toName}：NT$ {item.amountDisplay}
                    </p>
                    <PaymentMethodsPreview profile={item.toMemberPaymentProfile ?? null} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="目前沒有待結算金額"
                description="如果每個人都打平，這裡就不會出現任何轉帳建議。"
              />
            )}
          </SectionCard>

          <SectionCard
            title="LINE Bot 操作"
            description="正式上線後，不需要再打開外部付款設定頁。每位成員只要私聊 Bot 設定一次，之後每次結算都會沿用。"
          >
            <div className="space-y-3 rounded-3xl bg-mist p-4 text-sm leading-6 text-slate-600">
              <div>
                <p className="font-semibold text-ink">群組綁定碼</p>
                <p className="mt-1 text-2xl font-semibold tracking-[0.18em] text-ink">
                  {data?.group.lineJoinCode ?? "------"}
                </p>
              </div>
              <p>
                在 LINE 群組可直接輸入：
                <span className="font-semibold text-ink"> 2{data?.group.lineJoinCode ?? "綁定碼"}</span>
                或
                <span className="font-semibold text-ink"> 綁定群組 {data?.group.lineJoinCode ?? "綁定碼"}</span>
              </p>
              <p>
                每位成員請私聊 Bot：
                <span className="font-semibold text-ink"> 10</span>、
                <span className="font-semibold text-ink"> 設定收款</span>、
                <span className="font-semibold text-ink"> 更改付款方式</span>
              </p>
              <p>
                若要先確認自己存了什麼，可私聊 Bot 輸入
                <span className="font-semibold text-ink"> 11</span> 或
                <span className="font-semibold text-ink"> 查看我的付款方式</span>。
              </p>
            </div>
          </SectionCard>
        </div>
      </div>

      <a
        href="#expense-form"
        className="fixed inset-x-4 bottom-4 z-20 inline-flex items-center justify-center rounded-2xl bg-accent px-5 py-4 text-base font-semibold text-white shadow-soft sm:hidden"
      >
        ＋ 新增支出
      </a>
    </main>
  );
}

function PaymentMethodsPreview({
  profile
}: {
  profile: MemberPaymentProfileDto | null;
}) {
  if (!profile || !profile.hasAnyMethod) {
    return (
      <div className="mt-3 rounded-2xl bg-mist p-3 text-sm leading-6 text-slate-600">
        <p className="font-medium text-ink">收款方式</p>
        <p className="mt-1">尚未設定。請對方私聊 Bot 輸入「10」或「設定收款」。</p>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-2xl bg-mist p-3 text-sm text-slate-600">
      <p className="font-medium text-ink">收款方式</p>
      {profile.acceptBankTransfer && profile.bankAccount ? (
        <p>
          銀行轉帳：
          {[profile.bankName, profile.bankAccount].filter(Boolean).join(" / ")}
        </p>
      ) : (
        <p>銀行轉帳：不收</p>
      )}
      <p>LINE Pay：{profile.acceptLinePay ? "可收" : "不收"}</p>
      <p>現金：{profile.acceptCash ? "可收" : "不收"}</p>
      {profile.paymentNote ? <p>備註：{profile.paymentNote}</p> : null}
    </div>
  );
}

function ExpenseItem({
  expense,
  onDelete
}: {
  expense: ExpenseDto;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold text-ink">{expense.title}</h3>
            <span className="rounded-full bg-mist px-3 py-1 text-sm font-semibold text-ink">
              NT$ {expense.amountDisplay}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
            <span className="rounded-full bg-mist px-3 py-1">
              付款人：{expense.payer.name}
            </span>
            <span className="rounded-full bg-mist px-3 py-1">
              {expense.participants.length} 人分攤
            </span>
            <span className="rounded-full bg-mist px-3 py-1">
              建立時間：{new Date(expense.createdAt).toLocaleDateString("zh-TW")}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            參與分帳成員：
            {expense.participants
              .map(
                (participant) =>
                  `${participant.member.name}（NT$ ${participant.shareDisplay}）`
              )
              .join("、")}
          </p>
          {expense.notes ? (
            <p className="mt-2 text-sm text-slate-500">備註：{expense.notes}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-2xl border border-danger/30 bg-white px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/5"
        >
          刪除
        </button>
      </div>
    </div>
  );
}

function LedgerItem({ ledger }: { ledger: LedgerDto }) {
  const statusLabel =
    ledger.status === "active"
      ? "進行中"
      : ledger.status === "closed"
        ? "已結束"
        : "已封存";

  return (
    <div className="rounded-[28px] border border-line bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-ink">{ledger.name}</p>
          <p className="mt-1 text-sm text-slate-500">
            建立於 {new Date(ledger.createdAt).toLocaleDateString("zh-TW")}
          </p>
        </div>
        <span className="rounded-full bg-mist px-3 py-1 text-sm font-medium text-ink">
          {statusLabel}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
        <span className="rounded-full bg-mist px-3 py-1">{ledger.expenseCount} 筆支出</span>
        {ledger.isActive ? (
          <span className="rounded-full bg-accent/10 px-3 py-1 font-medium text-accent">
            目前帳本
          </span>
        ) : null}
      </div>
    </div>
  );
}
