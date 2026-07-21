"use client";

export default function XShareButton({
  companyName,
  ticker,
  score,
  dangerScore,
  riskLabel,
}: {
  companyName: string;
  ticker: string;
  score: number;
  dangerScore: number;
  riskLabel: string;
}) {
  const url = `https://kessan-tantei.jp/company/${ticker}`;

  const text = `決算探偵で ${companyName}（${ticker}）を分析

財務スコア：${score}
Danger Score：${dangerScore}
判定：${riskLabel}

成長性・収益性・キャッシュ・財務リスクを決算データから確認できます。

#決算探偵 #日本株 #決算分析`;

  const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    text
  )}&url=${encodeURIComponent(url)}`;

  return (
    <a
      href={shareUrl}
      target="_blank"
      rel="noreferrer"
      data-pressable="true"
      className="inline-flex min-h-10 w-fit items-center justify-center rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs font-black text-slate-200 transition hover:bg-white/10 hover:text-white sm:text-sm"
      aria-label={`${companyName}の分析結果をXで共有`}
    >
      Xで共有 ↗
    </a>
  );
}
