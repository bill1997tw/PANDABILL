"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { Toast } from "@/components/toast";
import { parseJson } from "@/lib/api";
import type { GroupListItem } from "@/types";

export function HomePage() {
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadGroups() {
    setLoading(true);
    setError(null);

    try {
      const data = await parseJson<{ groups: GroupListItem[] }>(
        await fetch("/api/groups", {
          cache: "no-store"
        })
      );
      setGroups(data.groups);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "讀取群組失敗。"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadGroups();
  }, []);

  async function handleCreateGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await parseJson(
        await fetch("/api/groups", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name })
        })
      );

      setName("");
      setSuccess("群組建立成功。");
      await loadGroups();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "建立群組失敗。"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-[32px] border border-white/80 bg-white/90 p-5 shadow-soft sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
              Split Bill
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">
              朋友分帳、旅遊記帳、活動帳本
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              同一個 LINE 群組可以反覆出遊、聚餐，但每次活動都拆成獨立帳本，不會混在一起。
            </p>
          </div>
          <div className="rounded-3xl bg-mist px-4 py-3 text-right">
            <p className="text-xs text-slate-500">群組數</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{groups.length}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["多帳本", "同一個群組可以有很多本，旅遊、聚餐、活動都能分開記。"],
            ["單一進行中", "每個群組同時間只會有一本目前帳本，避免記錯地方。"],
            ["歷史封存", "舊帳本可結束、可封存，但資料不會消失。"]
          ].map(([title, description]) => (
            <div key={title} className="rounded-3xl bg-mist px-4 py-4">
              <p className="font-semibold text-ink">{title}</p>
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <SectionCard
          title="建立新群組"
          description="先建立 LINE 群組對應的容器。建立後，請到 LINE 群組裡綁定並建立活動帳本。"
        >
          <form className="space-y-4" onSubmit={handleCreateGroup}>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">
                群組名稱
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：大學好友旅遊團"
                maxLength={50}
              />
            </div>
            {error ? <Toast message={error} /> : null}
            {success ? <Toast tone="success" message={success} /> : null}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? "建立中..." : "建立群組"}
            </button>
          </form>
        </SectionCard>
      </div>

      <div className="mt-8">
        <SectionCard
          title="群組列表"
          description="點進群組可查看成員、目前活動帳本、最近支出與結算。"
        >
          {loading ? (
            <p className="text-sm text-slate-500">載入中...</p>
          ) : groups.length === 0 ? (
            <EmptyState
              title="目前還沒有群組"
              description="建立第一個群組後，就能開始把旅遊和聚餐帳本分開管理。"
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {groups.map((group) => (
                <Link
                  key={group.id}
                  href={`/groups/${group.id}`}
                  className="group rounded-[28px] border border-line bg-white p-5 shadow-sm hover:-translate-y-0.5 hover:border-accent/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-ink group-hover:text-accent">
                        {group.name}
                      </h3>
                      <p className="mt-2 text-sm text-slate-500">
                        建立於 {new Date(group.createdAt).toLocaleString("zh-TW")}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500">
                      {group.expenseCount} 筆支出
                    </span>
                  </div>

                  <div className="mt-5 space-y-2 text-sm text-slate-600">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-mist px-3 py-1">
                        {group.memberCount} 位成員
                      </span>
                      <span className="rounded-full bg-mist px-3 py-1">
                        {group.ledgerCount} 本帳本
                      </span>
                    </div>
                    <p>LINE 綁定碼：{group.lineJoinCode}</p>
                    <p>
                      目前帳本：
                      <span className="font-medium text-ink">
                        {group.activeLedgerName ?? "尚未建立"}
                      </span>
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
