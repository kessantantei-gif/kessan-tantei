import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/admin-engine";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type EventRow = {
  event_name: string;
  path: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
};

function sourceOf(event: EventRow) {
  if (event.utm_source) return event.utm_source;
  return "direct / organic";
}

export default async function AcquisitionAdminPage() {
  if (!(await isAdminUser())) redirect("/");

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("acquisition_events")
    .select("event_name, path, utm_source, utm_medium, utm_campaign, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);

  const events = (data ?? []) as EventRow[];
  const count = (name: string) => events.filter((event) => event.event_name === name).length;
  const pageViews = count("page_view") + count("pricing_view");
  const pricingViews = count("pricing_view");
  const checkoutStarts = count("checkout_start");
  const conversions = count("checkout_complete");
  const pricingRate = pageViews ? (pricingViews / pageViews) * 100 : 0;
  const conversionRate = pricingViews ? (conversions / pricingViews) * 100 : 0;

  const sourceMap = new Map<string, { views: number; pricing: number; checkout: number; conversions: number }>();
  for (const event of events) {
    const source = sourceOf(event);
    const current = sourceMap.get(source) ?? { views: 0, pricing: 0, checkout: 0, conversions: 0 };
    if (event.event_name === "page_view" || event.event_name === "pricing_view") current.views += 1;
    if (event.event_name === "pricing_view") current.pricing += 1;
    if (event.event_name === "checkout_start") current.checkout += 1;
    if (event.event_name === "checkout_complete") current.conversions += 1;
    sourceMap.set(source, current);
  }

  const sources = [...sourceMap.entries()].sort((a, b) => b[1].views - a[1].views);
  const topPaths = [...events.reduce((map, event) => {
    if (event.event_name !== "page_view" && event.event_name !== "pricing_view") return map;
    const path = event.path || "不明";
    map.set(path, (map.get(path) ?? 0) + 1);
    return map;
  }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.28em] text-violet-300">ACQUISITION</p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">集客・転換ダッシュボード</h1>
            <p className="mt-3 text-slate-400">直近30日間のUTM流入からPro登録までを確認します。</p>
          </div>
          <Link href="/admin" className="text-sm font-bold text-slate-400 hover:text-white">← Adminへ戻る</Link>
        </div>

        {error && (
          <div className="mt-8 rounded-3xl border border-yellow-400/30 bg-yellow-500/10 p-6 text-yellow-100">
            計測テーブルを取得できません。Supabase migrationの反映後に集計が始まります。
          </div>
        )}

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["ページ閲覧", pageViews],
            ["Pricing到達", pricingViews],
            ["Checkout開始", checkoutStarts],
            ["Pro登録", conversions],
            ["Pricing→Pro", `${conversionRate.toFixed(1)}%`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-slate-400">{label}</p>
              <p className="mt-2 text-3xl font-black">{value}</p>
            </div>
          ))}
        </section>

        <p className="mt-4 text-sm text-slate-500">全閲覧からPricingへの到達率：{pricingRate.toFixed(1)}%</p>

        <section className="mt-8 rounded-3xl border border-violet-400/20 bg-violet-500/10 p-6">
          <h2 className="text-2xl font-black">流入元別</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-slate-400"><tr><th className="p-3">流入元</th><th className="p-3">閲覧</th><th className="p-3">Pricing</th><th className="p-3">Checkout</th><th className="p-3">Pro登録</th></tr></thead>
              <tbody>
                {sources.map(([source, item]) => (
                  <tr key={source} className="border-t border-white/10"><td className="p-3 font-bold">{source}</td><td className="p-3">{item.views}</td><td className="p-3">{item.pricing}</td><td className="p-3">{item.checkout}</td><td className="p-3 font-black text-yellow-200">{item.conversions}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-2xl font-black">閲覧ページ上位</h2>
          <div className="mt-5 space-y-2">
            {topPaths.map(([path, views]) => (
              <div key={path} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-4"><span className="truncate pr-4">{path}</span><span className="font-black">{views}</span></div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
