import Link from "next/link";
import type { marketDefinitions } from "@/lib/markets";

type MarketDefinition = (typeof marketDefinitions)[keyof typeof marketDefinitions];

const toneClasses = {
  green: "border-green-400/25 bg-green-500/10",
  cyan: "border-cyan-400/25 bg-cyan-500/10",
  violet: "border-violet-400/25 bg-violet-500/10",
} as const;

const badgeClasses = {
  green: "bg-green-300 text-slate-950",
  cyan: "bg-cyan-300 text-slate-950",
  violet: "bg-violet-300 text-slate-950",
} as const;

const buttonClasses = {
  green: "bg-green-300 text-slate-950 hover:bg-green-200",
  cyan: "bg-cyan-300 text-slate-950 hover:bg-cyan-200",
  violet: "bg-violet-300 text-slate-950 hover:bg-violet-200",
} as const;

export default function MarketPortalCard({ market }: { market: MarketDefinition }) {
  const active = market.status === "active";
  const rankingHref =
    market.slug === "growth" ? "/ranking" : `/${market.slug}/ranking`;

  return (
    <article
      className={`flex min-h-72 flex-col rounded-3xl border p-6 shadow-xl shadow-black/20 sm:p-8 ${toneClasses[market.accent]}`}
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

      <div className="mt-auto grid gap-3 pt-8 sm:grid-cols-2">
        <Link
          href={market.href}
          className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-black text-white transition hover:bg-white/10"
        >
          市場トップ
        </Link>
        <Link
          href={rankingHref}
          className={`inline-flex min-h-12 items-center justify-center rounded-2xl px-4 py-3 text-sm font-black transition ${buttonClasses[market.accent]}`}
        >
          ランキング
        </Link>
      </div>
    </article>
  );
}
