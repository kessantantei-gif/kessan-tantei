export const marketDefinitions = {
  prime: {
    slug: "prime",
    name: "プライム市場",
    englishName: "Prime",
    status: "active",
    description:
      "収益力・資本効率・安定CF・財務安全性・株主還元を中心に、大企業を多面的に分析します。",
    href: "/prime",
    rankingHref: "/prime/ranking",
    accent: "violet",
  },
  standard: {
    slug: "standard",
    name: "スタンダード市場",
    englishName: "Standard",
    status: "active",
    description:
      "成長性に加えて、割安性・財務安全性・キャッシュ創出力・株主還元を重視して分析します。",
    href: "/standard",
    rankingHref: "/standard/ranking",
    accent: "cyan",
  },
  growth: {
    slug: "growth",
    name: "グロース市場",
    englishName: "Growth",
    status: "active",
    description:
      "高い成長可能性を持つ企業を、売上成長・収益品質・営業CF・資金繰り・リスクから分析します。",
    href: "/",
    rankingHref: "/ranking",
    accent: "green",
  },
} as const;

export type MarketSlug = keyof typeof marketDefinitions;

export function getMarketDefinition(slug: string) {
  return marketDefinitions[slug as MarketSlug] ?? null;
}

export const marketList = Object.values(marketDefinitions);
