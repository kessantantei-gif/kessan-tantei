import Link from "next/link";

const categories = [
  {
    title: "📊 財務スコア",
    items: [
      { name: "財務スコア", href: "/ranking/score" },
    ],
  },
  {
    title: "📈 成長",
    items: [
      { name: "売上成長率", href: "/ranking/revenue-growth" },
      { name: "売上総利益成長率", href: "/ranking/gross-profit-growth" },
      { name: "営業利益成長率", href: "/ranking/operating-income-growth" },
      { name: "Rule of 40", href: "/ranking/rule40" },
    ],
  },
  {
    title: "💰 収益",
    items: [
      { name: "営業利益率", href: "/ranking/operating-margin" },
      { name: "EBITDA", href: "/ranking/ebitda-margin" },
      { name: "ROE", href: "/ranking/roe" },
      { name: "ROA", href: "/ranking/roa" },
    ],
  },
  {
    title: "💵 キャッシュ",
    items: [
      { name: "営業CF", href: "/ranking/operating-cf" },
      { name: "フリーCF", href: "/ranking/free-cf" },
      { name: "現金保有額", href: "/ranking/cash" },
    ],
  },
  {
    title: "🛡 安全性",
    items: [
      { name: "自己資本比率", href: "/ranking/equity-ratio" },
      { name: "流動比率", href: "/ranking/current-ratio" },
    ],
  },
  {
    title: "🚨 シグナル",
    items: [
      { name: "リスクシグナル", href: "/ranking/risk-signals" },
      { name: "ポジティブシグナル", href: "/ranking/positive-signals" },
    ],
  },
];

export default function RankingsPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <h1 className="mb-2 text-4xl font-black text-white">
        ランキング一覧
      </h1>

      <p className="mb-10 text-slate-400">
        財務分析ランキングをカテゴリーごとに掲載しています。
      </p>

      <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => (
          <section
            key={category.title}
            className="rounded-3xl border border-white/10 bg-[#07111f] p-6"
          >
            <h2 className="mb-5 text-xl font-black text-white">
              {category.title}
            </h2>

            <div className="space-y-3">
              {category.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 transition hover:bg-green-500/10 hover:text-green-300"
                >
                  <span>{item.name}</span>
                  <span>→</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}