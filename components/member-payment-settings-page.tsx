import { Toast } from "@/components/toast";
import type { MemberPaymentProfileDto } from "@/types";

type MemberPaymentSettingsPageProps = {
  token: string;
  memberName: string;
  groupName: string;
  paymentProfile: MemberPaymentProfileDto | null;
  error?: string | null;
  saved?: boolean;
};

export function MemberPaymentSettingsPage({
  token,
  memberName,
  groupName,
  paymentProfile,
  error,
  saved
}: MemberPaymentSettingsPageProps) {
  return (
    <main className="min-h-screen bg-[#f4f7fb] pb-32">
      <div className="mx-auto max-w-xl px-4 py-5">
        <section className="rounded-[28px] bg-white p-5 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
            收款設定 v5
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink">
            {memberName}
          </h1>
          <p className="mt-3 text-base leading-8 text-slate-600">
            這是群組「{groupName}」給你的專屬付款設定頁。填好後，朋友在結算時就能直接看到怎麼付款給你。
          </p>
        </section>

        <div className="mt-4 space-y-3">
          {error ? <Toast message={error} /> : null}
          {saved ? (
            <Toast
              tone="success"
              message="已儲存。結算頁會直接顯示怎麼付款給你。"
            />
          ) : null}
        </div>

        <form
          className="mt-4 space-y-4"
          method="POST"
          action={`/member-settings/${token}/save`}
        >
          <ToggleSection
            name="acceptBankTransfer"
            defaultChecked={paymentProfile?.acceptBankTransfer ?? false}
            title="銀行轉帳"
            subtitle="適合大額結算"
          >
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  銀行名稱
                </label>
                <input
                  name="bankName"
                  defaultValue={paymentProfile?.bankName ?? ""}
                  placeholder="例如：玉山銀行 808"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  銀行帳號
                </label>
                <input
                  name="bankAccount"
                  defaultValue={paymentProfile?.bankAccount ?? ""}
                  placeholder="例如：12345-6789012"
                />
              </div>
            </div>
          </ToggleSection>

          <ToggleSection
            name="acceptLinePay"
            defaultChecked={paymentProfile?.acceptLinePay ?? false}
            title="LINE Pay"
            subtitle="適合旅途中快速收款"
          >
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-ink">
                LINE Pay 資訊
              </label>
              <input
                name="linePayId"
                defaultValue={paymentProfile?.linePayId ?? ""}
                placeholder="例如：名稱、ID 或收款說明"
              />
            </div>
          </ToggleSection>

          <ToggleSection
            name="acceptCash"
            defaultChecked={paymentProfile?.acceptCash ?? true}
            title="現金"
            subtitle="如果願意現場收現金就保持開啟"
          />

          <section className="rounded-[28px] bg-white p-5 shadow-soft">
            <h2 className="text-lg font-semibold text-ink">付款備註</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              例如：不收現金、轉帳後請截圖、或只收現金請當面給我。
            </p>
            <textarea
              name="paymentNote"
              rows={4}
              defaultValue={paymentProfile?.paymentNote ?? ""}
              className="mt-4 min-h-[120px] w-full rounded-3xl border border-line bg-[#f8fafc] px-4 py-4 text-base text-ink outline-none placeholder:text-slate-400 focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="例如：不收現金，轉帳後請截圖。"
            />
          </section>

          <div className="h-20" />

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
            <div className="mx-auto max-w-xl">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-accent px-4 py-4 text-base font-semibold text-white shadow-soft hover:bg-accent/90"
              >
                儲存付款設定
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}

function ToggleSection({
  name,
  defaultChecked,
  title,
  subtitle,
  children
}: {
  name: string;
  defaultChecked: boolean;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  const inputId = `${name}-toggle`;

  return (
    <section className="rounded-[28px] bg-white p-5 shadow-soft">
      <input
        id={inputId}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <label htmlFor={inputId} className="flex cursor-pointer items-start gap-4">
        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-bold text-white peer-checked:border-accent peer-checked:bg-accent">
          ✓
        </span>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-ink">{title}</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-500 peer-checked:bg-accent/10 peer-checked:text-accent">
              <span className="peer-checked:hidden">未開啟</span>
              <span className="hidden peer-checked:inline">已開啟</span>
            </span>
          </div>
        </div>
      </label>
      <div className="hidden peer-checked:block">{children}</div>
    </section>
  );
}
