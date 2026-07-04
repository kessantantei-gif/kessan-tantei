import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import ProLock from "@/components/pro-lock";
import { isProUser } from "@/lib/pro-engine";

export default async function AnomaliesPage() {
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
    .select("ticker, company_name, danger_score, risk")
    .order("danger_score", { ascending: false });

  const companies = (data ?? []).filter(
    (company: any) => company.risk?.flags?.length > 0
  );

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="text-2xl font-black">決算探偵</Link>

        <h1 className="mt-6 text-4xl font-black text-yellow-300">
          財務異変検知
        </h1>

        <div className="mt-8 space-y-4">
          {companies.map((company: any) => (
            <Link
              key={company.ticker}
              href={`/company/${company.ticker}`}
              className="block rounded-2xl border border-yellow-400/20 bg-yellow-500/10 p-5"
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