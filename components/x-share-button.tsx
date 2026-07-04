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

  const text = `決算探偵で ${companyName}(${ticker}) を分析

Score: ${score}
Danger: ${dangerScore}
判定: ${riskLabel}

買う銘柄を探す前に、買ってはいけない銘柄を除外する。

#決算探偵 #日本株 #グロース株`;

  const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    text
  )}&url=${encodeURIComponent(url)}`;

  return (
    <a
      href={shareUrl}
      target="_blank"
      rel="noreferrer"
      className="rounded-2xl border border-white/10 bg-black/30 px-5 py-3 text-center text-sm font-black text-white hover:bg-white/10"
    >
      Xで共有
    </a>
  );
}