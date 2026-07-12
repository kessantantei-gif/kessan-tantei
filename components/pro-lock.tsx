import ProValueCard, { type ProValueItem } from "./pro-value-card";

export default function ProLock({
  title = "この機能はPro限定です",
  message = "無料版では概要まで確認できます。ProではAI分析全文、Red Flags、財務シグナル全件、比較候補全件、決算変化の詳細まで確認できます。",
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
