import ProValueCard, { type ProValueItem } from "./pro-value-card";

export default function ProLock({
  title = "この機能はPro限定です",
  message = "無料版では主要指標まで表示します。Proでは全順位、判定根拠、警戒シグナル内訳、固定4指標、決算変化を確認できます。",
  items,
  ctaLabel,
  compact = false,
}: {
  title?: string;
  message?: string;
  items?: ProValueItem[];
  ctaLabel?: string;
  compact?: boolean;
}) {
  return (
    <ProValueCard
      title={title}
      message={message}
      items={items}
      ctaLabel={ctaLabel}
      compact={compact}
    />
  );
}
