import Link from "next/link";
import { redirect } from "next/navigation";
import AdminCompanyMasterManager from "@/components/admin-company-master-manager";
import { isAdminUser } from "@/lib/admin-engine";
import { loadRuntimeCompanyMasterEntries } from "@/lib/company-master-runtime";

export const dynamic = "force-dynamic";

export default async function AdminCompanyMasterPage() {
  if (!(await isAdminUser())) {
    redirect("/");
  }

  const entries = await loadRuntimeCompanyMasterEntries();

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/admin" className="text-sm font-bold text-green-300 hover:text-green-200">
              ← 管理トップ
            </Link>
            <p className="mt-5 text-xs font-black tracking-[0.3em] text-green-300">
              COMPANY MASTER ADMIN
            </p>
            <h1 className="mt-3 text-3xl font-black sm:text-5xl">会社マスタ管理</h1>
            <p className="mt-4 max-w-3xl leading-8 text-slate-300">
              自動分類された全社データを確認し、テーマ、サブテーマ、ビジネスモデル、比較会社をブラウザから監修できます。保存内容は同業比較へ反映されます。
            </p>
          </div>

          <Link
            href="/"
            className="w-fit rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-slate-300 hover:bg-white/10 hover:text-white"
          >
            サイトを確認
          </Link>
        </div>

        <div className="mt-8">
          <AdminCompanyMasterManager initialEntries={entries} />
        </div>
      </div>
    </main>
  );
}
