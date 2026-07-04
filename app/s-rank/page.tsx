import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import ProLock from "@/components/pro-lock";
import { isProUser } from "@/lib/pro-engine";

export default async function SRankPage() {
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
    .gte("score", 85)
    .lte("danger_score", 25)
    .order("score", { ascending: false })
    .limit(100);

  const companies = data ?? [];

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="text-2xl font-black">決算探偵</Link>

        <h1 className="mt-6 text-4xl font-black">S級銘柄一覧</h1>

        <div className="mt-8 space-y-4">
          {companies.map((company: any, index) => (
            <Link
              key={company.ticker}
              href={`/company/${company.ticker}`}
              className="block rounded-2xl border border-green-400/20 bg-green-500/10 p-5"
            >
              <div className="grid sm:grid-cols-4 gap-4">
                <p>#{index + 1}</p>
                <p>{company.company_name}</p>
                <p>Score: {company.score}</p>
                <p>Danger: {company.danger_score}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}