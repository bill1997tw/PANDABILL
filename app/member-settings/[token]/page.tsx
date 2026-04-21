type Props = {
  params: {
    token: string;
  };
};

export default function MemberSettingsByTokenPage(_: Props) {
  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 py-10">
      <div className="mx-auto max-w-xl rounded-[28px] bg-white p-6 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
          收款設定
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
          這個連結已停用
        </h1>
        <p className="mt-4 text-base leading-8 text-slate-600">
          為了降低個人付款資料外流風險，付款方式改成由每位成員直接私聊 LINE Bot 設定。
        </p>
        <div className="mt-6 rounded-3xl bg-mist p-4 text-sm leading-7 text-slate-600">
          請改用以下方式：
          <br />
          1. 私聊 Bot 輸入「設定收款」或「10」
          <br />
          2. 依照 Bot 提示一步一步完成設定
          <br />
          3. 之後新群組與新結算都會沿用這份設定
        </div>
      </div>
    </main>
  );
}
