import type { Metadata } from "next";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "運営ステータス | 決算探偵",
  description: "決算探偵の運営・監査ステータスを確認するためのページです。",
  robots: {
    index: false,
    follow: false,
  },
};

async function loadStatus() {
  const { count, error } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker", { count: "exact", head: true })
    .neq("risk_level", "EXCLUDED");

  return {
    companyCount: count ?? 0,
    dbOk: !error,
    errorMessage: error?.message ?? null,
  };
}

function StatusCard({ title, value, ok }: { title: string; value: string; ok: boolean }) {
  return (
    <div className={ok ? "rounded-3xl border border-green-300/20 bg-green-500/10 p-5" : "rounded-3xl border border-red-300/20 bg-red-500/10 p-5"}>
      <p className="text-xs font-black tracking-[0.2em] text-slate-400">{title}</p>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
      <p className={ok ? "mt-2 text-sm font-bold text-green-200" : "mt-2 text-sm font-bold text-red-200"}>{ok ? "OK" : "CHECK"}</p>
    </div>
  );
}

export default async function OpsPage() {
  const status = await loadStatus();

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.28em] text-slate-500">OPERATIONS</p>
            <h1 className="mt-3 text-3xl font-black sm:text-5xl">運営ステータス</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
              公開前・公開後の運営状態を確認するための内部向けステータスページです。
            </p>
          </div>
          <Link href="/" className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-white/10">
            トップへ
          </Link>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard title="DATABASE" value={status.dbOk ? "接続OK" : "接続失敗"} ok={status.dbOk} />
          <StatusCard title="COMPANIES" value={`${status.companyCount}社`} ok={status.companyCount >= 500} />
          <StatusCard title="SEO" value="監査対応" ok />
          <StatusCard title="STRIPE" value="監査対応" ok />
        </div>

        {status.errorMessage ? (
          <div className="mt-6 rounded-3xl border border-red-300/20 bg-red-500/10 p-5 text-sm leading-7 text-red-100">
            DBエラー：{status.errorMessage}
          </div>
        ) : null}

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <h2 className="text-2xl font-black">運営コマンド</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
            <p><code className="rounded bg-black/30 px-2 py-1">npm run audit:release</code> 公開前監査</p>
            <p><code className="rounded bg-black/30 px-2 py-1">npm run audit:seo</code> SEO監査</p>
            <p><code className="rounded bg-black/30 px-2 py-1">npm run audit:stripe</code> Stripe監査</p>
            <p><code className="rounded bg-black/30 px-2 py-1">npm run audit:final</code> 最終公開判定</p>
          </div>
        </section>
      </section>
    </main>
  );
}
