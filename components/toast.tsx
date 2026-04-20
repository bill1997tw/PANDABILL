type ToastProps = {
  tone?: "error" | "success";
  message: string;
};

export function Toast({ tone = "error", message }: ToastProps) {
  const toneClass =
    tone === "success"
      ? "border-accent/20 bg-accent/10 text-accent"
      : "border-danger/20 bg-danger/10 text-danger";

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClass}`}>
      {message}
    </div>
  );
}
