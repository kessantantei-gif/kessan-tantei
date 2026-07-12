import Link from "next/link";
import { redirect } from "next/navigation";
import AdminOperationsManager from "@/components/admin-operations-manager";
import { isAdminUser } from "@/lib/admin-engine";

export const dynamic = "force-dynamic";

export default async function AdminOperationsPage() {
  const isAdmin = await isAdminUser();

  if (!isAdmin) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.3em] text-cyan-300">OPERATIONS CONTROL</p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">AI・データ・コンテンツ管理</h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-400">
              AI分析の再計算、財務データ欠損、決算速報の生成可否、ニュースデータの不備をまとめて確認します。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/company-master" className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-black hover:bg-white/10">
              会社マスタ
            </Link>
            <Link href="/admin" className="rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-black text-slate-300 hover:text-white">
              ← 管理トップ
            </Link>
          </div>
        </div>

        <AdminOperationsManager />
      </div>
    </main>
  );
}
