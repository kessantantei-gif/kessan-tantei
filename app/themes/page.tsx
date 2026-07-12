import type { Metadata } from "next";
import Link from "next/link";
import { industryThemeLabels } from "@/lib/industry-classifier";
import { loadRuntimeCompanyMasterEntries } from "@/lib/company-master-runtime";
import { seoThemeDescriptions, seoThemeIds } from "@/lib/seo-hubs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "グロース市場のテーマ別企業一覧 | 決算探偵",
  description:
    "AI、SaaS、宇宙、バイオ、半導体など、グロース市場の企業を事業テーマ別に整理し、財務スコアや決算データへつなげます。",
  alternates: { canonical: "/themes" },
};

export default async function ThemesPage() {
  const entries = await loadRuntimeCompanyMasterEntries();
  const counts = new Map<string, number>();

  for (const entry of entries) {
    counts.set(entry.themeId, (counts.get(entry.themeId) ?? 0) + 1);
  }

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-10 text-white sm:px-8 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-4xl">
          <p className="text-xs font-black tracking-[0.3em] text-cyan-300">THEME DIRECTORY</p>
          <h1 className="mt-3 text-4xl font-black leading-tight sm:text-6xl">
            グロース市場をテーマ別に探す
          </h1>
          <p className="mt-5 text-base leading-8 text-slate-300 sm:text-lg">
            事業領域が近い企業をまとめて確認できます。各テーマページから、財務スコア、売上成長率、営業利益率、営業CF、リスクシグナルを比較できます。
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {seoThemeIds.map((theme) => (
            <Link
              key={theme}
              href={`/themes/${theme}`}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 transition hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-cyan-500/10"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-xl font-black text-white">{industryThemeLabels[theme]}</h2>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-200">
                  {counts.get(theme) ?? 0}社
                </span>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                {seoThemeDescriptions[theme]}
              </p>
              <span className="mt-5 inline-flex text-sm font-black text-cyan-200">企業一覧を見る →</span>
            </Link>
          ))}
        </div>

        <section className="mt-10 rounded-3xl border border-yellow-300/20 bg-yellow-400/10 p-6 sm:p-8">
          <h2 className="text-2xl font-black">財務特徴から探す</h2>
          <p className="mt-3 leading-7 text-slate-300">
            事業テーマではなく、高成長、黒字、営業CF、利益率改善、リスクシグナルなどの決算特徴からも企業を探せます。
          </p>
          <Link
            href="/features"
            className="mt-5 inline-flex rounded-full bg-yellow-400 px-6 py-3 font-black text-slate-950 hover:bg-yellow-300"
          >
            財務特徴別一覧へ →
          </Link>
        </section>
      </div>
    </main>
  );
}
