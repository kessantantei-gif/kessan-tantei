import Link from "next/link";
import { marketDefinitions, type MarketSlug } from "@/lib/markets";

const toneClasses: Record<
  MarketSlug,
  {
    eyebrow: string;
    border: string;
    panel: string;
    button: string;
  }
> = {
  growth: {
    eyebrow: "text-green-300",
    border: "border-green-400/25",
    panel: "from-green-500/15 to-emerald-500/5",
    button: "bg-green-300 text-slate-950 hover:bg-green-200",
  },
  standard: {
    eyebrow: "text-cyan-300",
    border: "border-cyan-400/25",
    panel: "from-cyan-500/15 to-sky-500/5",
    button: "bg-cyan-300 text-slate-950 hover:bg-cyan-200",
  },
  prime: {
    eyebrow: "text-violet-300",
    border: "border-violet-400/25",
    panel: "from-violet-500/15 to-indigo-500/5",
    button: "bg-violet-300 text-slate-950 hover:bg-violet-200",
  },
};

export default function MarketDirectoryCallout({
  marketSlug,
}: {
  marketSlug: MarketSlug;
}) {
  const market = marketDefinitions[marketSlug];
  const tone = toneClasses[marketSlug];

  return (
    <section className="bg-[#050816] px-4 pb-12 text-white sm:px-8 sm:pb-16">
      <div
        className={`mx-auto max-w-7xl rounded-3xl border ${tone.border} bg-gradient-to-br ${tone.panel} p-6 shadow-2xl shadow-black/20 sm:p-8`}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className={`text-xs font-black tracking-[0.24em] ${tone.eyebrow}`}>
              COMPANY DIRECTORY
            </p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">
              {market.name}の分析済み企業をすべて見る
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              検索ボックスを使わず、証券コード順の一覧から企業を探せます。各企業の財務スコア、売上成長率、営業利益率、Danger Scoreへ直接移動できます。
            </p>
          </div>
          <Link
            href={`/companies/${marketSlug}`}
            className={`shrink-0 rounded-2xl px-5 py-3 text-center font-black transition ${tone.button}`}
          >
            {market.name}の全企業一覧 →
          </Link>
        </div>
      </div>
    </section>
  );
}
