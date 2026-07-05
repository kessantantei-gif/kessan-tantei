type MetricBadgeProps = {
  label: string;
  value: string;
  tone?: "green" | "cyan" | "yellow" | "red" | "slate";
};

export default function MetricBadge({
  label,
  value,
  tone = "slate",
}: MetricBadgeProps) {
  const className =
    tone === "green"
      ? "border-green-400/25 bg-green-500/10 text-green-200 shadow-green-950/20"
      : tone === "cyan"
      ? "border-cyan-400/25 bg-cyan-500/10 text-cyan-200 shadow-cyan-950/20"
      : tone === "yellow"
      ? "border-yellow-400/25 bg-yellow-500/10 text-yellow-200 shadow-yellow-950/20"
      : tone === "red"
      ? "border-red-400/25 bg-red-500/10 text-red-200 shadow-red-950/20"
      : "border-white/10 bg-white/5 text-slate-200 shadow-black/20";

  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-lg ${className}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-1.5 text-xl font-black leading-none sm:text-2xl">
        {value}
      </p>
    </div>
  );
}
