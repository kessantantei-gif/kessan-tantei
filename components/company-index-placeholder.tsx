import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";

type Props = {
  ticker: string;
  companyName: string;
  marketSegment: string | null;
  industryName: string | null;
};

type DisclosureRow = {
  title: string | null;
  disclosed_at: string | null;
  document_type: string | null;
  source_url: string | null;
  xbrl_url: string | null;
  pdf_url: string | null;
};

function marketLabel(value: string | null) {
  if (value === "prime") return "プライム市場";
  if (value === "standard") return "スタンダード市場";
  if (value === "growth") return "グロース市場";
  return "上場市場確認中";
}

function marketHref(value: string | null) {
  if (value === "prime") return "/prime";
  if (value === "standard") return "/standard";
  if (value === "growth") return "/";
  return "/markets";
}

function disclosureHref(row: DisclosureRow) {
  return row.pdf_url ?? row.xbrl_url ?? row.source_url ?? null;
}

function formatDisclosureDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

async function loadRecentDisclosures(ticker: string) {
  const { data, error } = await supabaseAdmin
    .from("company_disclosures")
    .select("title, disclosed_at, document_type, source_url, xbrl_url, pdf_url")
    .eq("ticker", ticker)
    .order("disclosed_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("company profile disclosure load failed", {
      ticker,
      message: error.message,
    });
    return [] as DisclosureRow[];
  }

  return (data ?? []) as DisclosureRow[];
}

export default async function CompanyIndexPlaceholder({
  ticker,
  companyName,
  marketSegment,
  industryName,
}: Props) {
  const market = marketLabel(marketSegment);
  const industry = industryName || "業種情報確認中";
  const disclosures = await loadRecentDisclosures(ticker);

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-10 text-white sm:px-8 sm:py-16">
      <article className="mx-auto max-w-5xl">
        <nav className="text-sm text-slate-400" aria-label="パンくず">
          <Link href="/" className="hover:text-white">決算探偵</Link>
          <span className="mx-2">/</span>
          <Link href={marketHref(marketSegment)} className="hover:text-white">{market}</Link>
          <span className="mx-2">/</span>
          <span>{companyName}</span>
        </nav>

        <header className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-10">
          <p className="text-xs font-black tracking-[0.24em] text-green-300">COMPANY PROFILE</p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">{companyName}</h1>
          <p className="mt-4 max-w-3xl leading-8 text-slate-300">
            {companyName}（証券コード：{ticker}）の上場市場、業種、直近の開示資料を確認できます。
            決算探偵では公式開示資料をもとに、決算・財務データの取得と分析を順次更新しています。
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-sm font-bold">
            <span className="rounded-full bg-white/10 px-4 py-2">証券コード {ticker}</span>
            <span className="rounded-full bg-green-500/10 px-4 py-2 text-green-200">{market}</span>
            <span className="rounded-full bg-cyan-500/10 px-4 py-2 text-cyan-200">{industry}</span>
          </div>
        </header>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <h2 className="text-2xl font-black">{companyName}の企業基本情報</h2>
          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <dt className="text-xs font-bold tracking-[0.16em] text-slate-400">証券コード</dt>
              <dd className="mt-2 text-xl font-black">{ticker}</dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <dt className="text-xs font-bold tracking-[0.16em] text-slate-400">上場市場</dt>
              <dd className="mt-2 text-xl font-black">{market}</dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <dt className="text-xs font-bold tracking-[0.16em] text-slate-400">業種</dt>
              <dd className="mt-2 text-xl font-black">{industry}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black tracking-[0.2em] text-cyan-300">DISCLOSURES</p>
              <h2 className="mt-2 text-2xl font-black">直近の開示資料</h2>
            </div>
            <Link href="/latest-earnings" className="text-sm font-bold text-cyan-300 hover:text-cyan-200">
              最新決算一覧を見る →
            </Link>
          </div>

          {disclosures.length > 0 ? (
            <ul className="mt-6 space-y-3">
              {disclosures.map((disclosure, index) => {
                const href = disclosureHref(disclosure);
                const date = formatDisclosureDate(disclosure.disclosed_at);
                const title = disclosure.title || "開示資料";

                return (
                  <li key={`${disclosure.disclosed_at ?? "unknown"}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 p-5">
                    <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-400">
                      {date ? <span>{date}</span> : null}
                      {disclosure.document_type ? <span>{disclosure.document_type}</span> : null}
                    </div>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block font-bold leading-7 text-white hover:text-cyan-200"
                      >
                        {title}
                      </a>
                    ) : (
                      <p className="mt-2 font-bold leading-7 text-white">{title}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5 leading-7 text-slate-300">
              現在、決算探偵の開示データベースで直近資料を確認中です。企業基本情報はこのページで継続して確認できます。
            </p>
          )}
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <h2 className="text-2xl font-black">決算・財務分析について</h2>
          <p className="mt-4 leading-8 text-slate-300">
            決算探偵では、有価証券報告書、半期報告書、決算短信などの公式開示資料から、売上高、利益、営業キャッシュフロー、財務安全性、成長率、リスクシグナルを整理します。
            {companyName}についても、取得・検証が完了した指標からこのURLに順次追加します。
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-green-400/15 bg-green-500/5 p-5">
              <h3 className="font-black text-green-200">確認する主な数値</h3>
              <p className="mt-2 text-sm leading-7 text-slate-300">売上成長率、営業利益率、営業CF、財務安全性、四半期推移などを確認します。</p>
            </div>
            <div className="rounded-2xl border border-yellow-300/15 bg-yellow-500/5 p-5">
              <h3 className="font-black text-yellow-100">確認する主なリスク</h3>
              <p className="mt-2 text-sm leading-7 text-slate-300">資金繰り、継続企業注記、希薄化、営業CF悪化などのシグナルを確認します。</p>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link href={marketHref(marketSegment)} className="rounded-3xl border border-green-400/20 bg-green-500/10 p-6 transition hover:-translate-y-0.5">
            <p className="text-xs font-black tracking-[0.2em] text-green-300">MARKET</p>
            <h2 className="mt-2 text-xl font-black">{market}の企業を見る</h2>
          </Link>
          <Link href="/ranking" className="rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-6 transition hover:-translate-y-0.5">
            <p className="text-xs font-black tracking-[0.2em] text-cyan-300">RANKING</p>
            <h2 className="mt-2 text-xl font-black">財務分析ランキングを見る</h2>
          </Link>
        </section>
      </article>
    </main>
  );
}
