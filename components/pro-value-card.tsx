import Link from "next/link";

export type ProValueItem = {
  label: string;
  detail?: string;
};

type Props = {
  title?: string;
  message?: string;
  items?: ProValueItem[];
  ctaLabel?: string;
  compact?: boolean;
};

export const DEFAULT_PRO_VALUE_ITEMS: ProValueItem[] = [
  { label: "AI分析全文", detail: "良い点・注意点・確認ポイントまで表示" },
  { label: "Danger内訳・Red Flags", detail: "検出理由と確認すべき開示を表示" },
  { label: "財務シグナル全件", detail: "無料枠で隠れている残りのシグナルを表示" },
  { label: "比較候補の全件", detail: "テーマ・財務・成長率別の比較候補を表示" },
  { label: "決算変化の詳細", detail: "改善・悪化項目と全指標の変化を表示" },
  { label: "ランキング全順位", detail: "TOP3以降の会社名・数値・コメントを表示" },
];

export default function ProValueCard({
  title = "この先の詳細分析はPro限定です",
  message = "無料版では概要まで確認できます。Proでは判断材料になる詳細分析・比較・リスク情報を最後まで確認できます。",
  items = DEFAULT_PRO_VALUE_ITEMS,
  ctaLabel = "初月100円でProを試す",
  compact = false,
}: Props) {
  return (
    <div className="overflow-hidden rounded-3xl border border-yellow-300/35 bg-gradient-to-br from-yellow-400/20 via-yellow-400/10 to-white/[0.03] p-[1px] shadow-2xl shadow-yellow-950/20">
      <div className={`rounded-3xl bg-[#080b14]/92 ${compact ? "p-4 sm:p-5" : "p-6 sm:p-8"}`}>
        <div className={compact ? "text-left" : "text-center"}>
          <div className={`${compact ? "h-10 w-10 text-lg" : "mx-auto h-14 w-14 text-2xl"} flex items-center justify-center rounded-2xl border border-yellow-300/30 bg-yellow-400/15 shadow-inner shadow-yellow-950/20`}>
            🔒
          </div>
          <p className="mt-4 text-xs font-black tracking-[0.28em] text-yellow-200">PRO ONLY</p>
          <h2 className={`${compact ? "text-xl" : "mx-auto max-w-2xl text-2xl sm:text-3xl"} mt-2 font-black leading-tight text-white`}>
            {title}
          </h2>
          <p className={`${compact ? "text-sm leading-7" : "mx-auto max-w-2xl text-sm leading-7 sm:text-base sm:leading-8"} mt-3 text-slate-300`}>
            {message}
          </p>
        </div>

        <div className={`mt-5 grid gap-3 ${compact ? "sm:grid-cols-2" : "mx-auto max-w-4xl sm:grid-cols-2 lg:grid-cols-3"}`}>
          {items.map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left">
              <p className="text-sm font-black text-yellow-50">✓ {item.label}</p>
              {item.detail ? <p className="mt-1 text-xs leading-5 text-slate-400">{item.detail}</p> : null}
            </div>
          ))}
        </div>

        <div className={compact ? "mt-5" : "mt-7 text-center"}>
          <Link
            href="/pricing"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-yellow-400 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-yellow-300 active:scale-95 sm:w-auto sm:text-base"
          >
            {ctaLabel}
          </Link>
          <p className="mt-3 text-xs leading-6 text-slate-500">
            初月100円、2か月目以降は月額980円。いつでも解約できます。
          </p>
        </div>
      </div>
    </div>
  );
}
