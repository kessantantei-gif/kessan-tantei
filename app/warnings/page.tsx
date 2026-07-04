import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import ProLock from "@/components/pro-lock";
import { isProUser } from "@/lib/pro-engine";

export default async function WarningsPage() {
  const isPro = await isProUser();

  if (!isPro) {
    return (
      <main className="min-h-screen bg-[#050816] p-8 text-white">
        <ProLock />
      </main>
    );
  }

  const { data } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score")
    .gte("danger_score", 70)
    .order("danger_score", { ascending: false });

  const companies = data ?? [];

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="text-2xl font-black">決算探偵</Link>

        <h1 className="mt-6 text-4xl font-black text-red-300">
          要注意銘柄一覧
        </h1>

        <div className="mt-8 space-y-4">
          {companies.map((company: any) => (
            <Link
              key={company.ticker}
              href={`/company/${company.ticker}`}
              className="block rounded-2xl border border-red-400/20 bg-red-500/10 p-5"
            >
              <p className="font-black">{company.company_name}</p>
              <p>{company.ticker}</p>
              <p>Danger: {company.danger_score}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}