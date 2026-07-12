import type { Metadata } from "next";
import Link from "next/link";
import { featureHubs } from "@/lib/seo-hubs";

export const metadata: Metadata = {
  title: "グロース企業を財務特徴から探す | 決算探偵",
  description:
    "高成長、黒字高成長、営業CF、利益率改善、赤字成長、Rule of 40、リスクシグナルなど、決算の特徴からグロース企業を探せます。",
  alternates: { canonical: "/features" },
};

export default function FeaturesPage() {
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "グロース企業の財務特徴別一覧",
    numberOfItems: featureHubs.length,
    itemListElement: featureHubs.map((feature, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: feature.title,
      url: `https://kessan-tantei.jp/ranking/${feature.slug}`,
    })),
  };

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-10 text-white sm:px-8 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList).replace(/</g, "\\u003c") }}
      />
      <div className="mx-auto max-w-7xl">
        <div className="max-w-4xl">
          <p className="text-xs font-black tracking-[0.3em] text-yellow-300">FINANCIAL FEATURES</p>
          <h1 className="mt-3 text-4xl font-black leading-tight sm:text-6xl">
            決算の特徴から企業を探す
          </h1>
          <p className="mt-5 text-base leading-8 text-slate-300 sm:text-lg">
            事業テーマだけでなく、売上成長、営業黒字、営業CF、利益率改善、赤字、リスクシグナルなど、決算上の特徴からグロース企業を比較できます。
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {featureHubs.map((feature) => (
            <Link
              key={feature.slug}
              href={`/ranking/${feature.slug}`}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 transition hover:-translate-y-0.5 hover:border-yellow-300/40 hover:bg-yellow-500/10"
            >
              <h2 className="text-xl font-black">{feature.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-400">{feature.description}</p>
              <span className="mt-5 inline-flex text-sm font-black text-yellow-200">ランキングを見る →</span>
            </Link>
          ))}
        </div>

        <section className="mt-10 rounded-3xl border border-cyan-300/20 bg-cyan-500/10 p-6 sm:p-8">
          <h2 className="text-2xl font-black">事業テーマから探す</h2>
          <p className="mt-3 leading-7 text-slate-300">
            AI、SaaS、宇宙、バイオ、半導体など、事業領域が近い企業同士でも比較できます。
          </p>
          <Link
            href="/themes"
            className="mt-5 inline-flex rounded-full bg-cyan-300 px-6 py-3 font-black text-slate-950 hover:bg-cyan-200"
          >
            テーマ別一覧へ →
          </Link>
        </section>
      </div>
    </main>
  );
}
