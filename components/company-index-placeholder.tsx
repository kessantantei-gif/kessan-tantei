import Link from "next/link";

type Props = {
  ticker: string;
  companyName: string;
  marketSegment: string | null;
  industryName: string | null;
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

export default function CompanyIndexPlaceholder({
  ticker,
  companyName,
  marketSegment,
  industryName,
}: Props) {
  const market = marketLabel(marketSegment);
  const industry = industryName || "業種情報確認中";

  return (
    <>
      <meta name="robots" content="noindex,follow" />
      <meta name="googlebot" content="noindex,follow" />
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
            <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
              <span className="rounded-full bg-white/10 px-4 py-2">証券コード {ticker}</span>
              <span className="rounded-full bg-green-500/10 px-4 py-2 text-green-200">{market}</span>
              <span className="rounded-full bg-cyan-500/10 px-4 py-2 text-cyan-200">{industry}</span>
            </div>
          </header>

          <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
            <h2 className="text-2xl font-black">{companyName}の決算・財務分析</h2>
            <p className="mt-4 leading-8 text-slate-300">
              {companyName}（証券コード：{ticker}）は{market}に上場する{industry}の企業です。
              決算探偵では、有価証券報告書、半期報告書、決算短信の取得後に、売上高、利益、キャッシュフロー、財務安全性、リスクシグナルを自動分析します。
            </p>
            <div className="mt-6 rounded-2xl border border-yellow-300/20 bg-yellow-500/10 p-5">
              <p className="font-black text-yellow-100">財務分析データを準備中です</p>
              <p className="mt-2 text-sm leading-7 text-yellow-50/80">
                公式開示資料の取得と検証が完了すると、このURLのままスコア、3期推移、四半期累計、決算変化速報を表示します。
              </p>
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
    </>
  );
}
