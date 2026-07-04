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
      ? "border-green-400/20 bg-green-500/10 text-green-300"
      : tone === "cyan"
      ? "border-cyan-400/20 bg-cyan-500/10 text-cyan-300"
      : tone === "yellow"
      ? "border-yellow-400/20 bg-yellow-500/10 text-yellow-300"
      : tone === "red"
      ? "border-red-400/20 bg-red-500/10 text-red-300"
      : "border-white/10 bg-white/5 text-slate-300";

  return (
    <div className={`rounded-2xl border px-4 py-3 ${className}`}>
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
}