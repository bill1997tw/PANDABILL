"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { parseJson } from "@/lib/api";
import type { GroupListItem } from "@/types";
import { SectionCard } from "@/components/section-card";
import { Toast } from "@/components/toast";
import { EmptyState } from "@/components/empty-state";

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
              小團體記帳，打開就能直接用。
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              建立群組、加成員、記一筆支出，系統自動幫你整理誰該付誰多少。
            </p>
          </div>
          <div className="rounded-3xl bg-mist px-4 py-3 text-right">
            <p className="text-xs text-slate-500">群組數</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{groups.length}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["旅遊", "交通、住宿、門票一起算"],
            ["室友", "水電瓦斯與日用品平分"],
            ["聚餐", "付款人和分攤名單一次搞定"]
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
          description="像建立一個帳本一樣，先命名，接著就能開始記帳。"
        >
          <form className="space-y-4" onSubmit={handleCreateGroup}>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">
                群組名稱
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：日本旅遊團"
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
          title="你的群組"
          description="點進去就能管理成員、新增支出，並查看即時結算結果。"
        >
          {loading ? (
            <p className="text-sm text-slate-500">讀取中...</p>
          ) : groups.length === 0 ? (
            <EmptyState
              title="還沒有任何群組"
              description="先建立一個群組，馬上開始記帳和分帳。"
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
                  <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-600">
                    <span className="rounded-full bg-mist px-3 py-1">
                      {group.memberCount} 位成員
                    </span>
                    <span className="rounded-full bg-mist px-3 py-1">
                      LINE 綁定碼 {group.lineJoinCode}
                    </span>
                    <span className="rounded-full bg-mist px-3 py-1">
                      查看詳情
                    </span>
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
