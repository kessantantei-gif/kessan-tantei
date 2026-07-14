import Link from "next/link";
import type { marketDefinitions } from "@/lib/markets";

type MarketDefinition = (typeof marketDefinitions)[keyof typeof marketDefinitions];

const toneClasses = {
  green: "border-green-400/25 bg-green-500/10 hover:border-green-300/50",
  cyan: "border-cyan-400/25 bg-cyan-500/10 hover:border-cyan-300/50",
  violet: "border-violet-400/25 bg-violet-500/10 hover:border-violet-300/50",
} as const;

const badgeClasses = {
  green: "bg-green-300 text-slate-950",
  cyan: "bg-cyan-300 text-slate-950",
  violet: "bg-violet-300 text-slate-950",
} as const;

export default function MarketPortalCard({ market }: { market: MarketDefinition }) {
  const active = market.status === "active";

  return (
    <Link
      href={market.href}
      className={`group flex min-h-72 flex-col rounded-3xl border p-6 shadow-xl shadow-black/20 transition hover:-translate-y-1 sm:p-8 ${toneClasses[market.accent]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black tracking-[0.25em] text-slate-400">
            {market.englishName.toUpperCase()}
          </p>
          <h2 className="mt-3 text-3xl font-black text-white">{market.name}</h2>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${badgeClasses[market.accent]}`}>
          {active ? "公開中" : "構築中"}
        </span>
      </div>

      <p className="mt-5 text-sm leading-7 text-slate-300">{market.description}</p>

      <div className="mt-auto pt-8 text-sm font-black text-white">
        {active ? "分析を見る" : "構築状況を見る"}
        <span className="ml-2 inline-block transition group-hover:translate-x-1">→</span>
      </div>
    </Link>
  );
}
