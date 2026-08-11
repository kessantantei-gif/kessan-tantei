import Link from "next/link";
import { auth } from "@/lib/clerk-server";
import TermsSubmitButton from "@/components/terms-submit-button";
import { createCheckoutSession } from "./actions";

const freeFeatures = [
  ["ランキング", "各ランキングTOP3まで閲覧"],
  ["企業ページ", "基本指標・Financial Score・Danger Scoreを確認"],
  ["ニュース", "関連ニュースを閲覧"],
  ["詳細判定", "無料枠内で一部利用"],
  ["警戒シグナル", "概要レベルで確認"],
];

const proFeatures = [
  ["全順位", "4位以降を含む全ランキングを閲覧"],
  ["判定根拠", "プラス材料・警戒材料・根拠数値を確認"],
  ["詳細判定", "全銘柄の判定と次回確認項目を表示"],
  ["警戒シグナル", "Danger Scoreの構成項目とスコア影響を確認"],
  ["決算変化", "売上・営業利益・営業CFの比較値を確認"],
  ["関連指標", "関連ランキング・企業ページを横断確認"],
];

const faqs = [
  {
    question: "無料では何が見られますか？",
    answer:
      "各ランキングのTOP3、企業ページの基本情報、Financial Score、Danger Score、ニュースなどを確認できます。4位以降の全順位や判定根拠の詳細はPro限定です。",
  },
  {
    question: "Proでは何が増えますか？",
    answer:
      "ランキング全順位、判定根拠、警戒シグナルの内訳、比較可能な決算変化、全銘柄の詳細判定を確認できます。",
  },
  {
    question: "投資助言サービスですか？",
    answer:
      "いいえ。決算探偵は取得済みの開示データを固定ルールで整理・比較する分析ツールです。特定銘柄の売買を推奨するものではありません。",
  },
  {
    question: "いつでも解約できますか？",
    answer:
      "はい。Proは月額サブスクリプションで、いつでも解約できます。初月のみ100円、2ヶ月目以降は月額980円です。",
  },
];

export default async function PricingPage() {
  const { userId } = await auth();

  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqStructuredData).replace(/</g, "\\u003c"),
        }}
      />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(250,204,21,0.18),transparent_32%),radial-gradient(circle_at_top_left,_rgba(34,197,94,0.16),transparent_30%),radial-gradient(circle_at_bottom,_rgba(59,130,246,0.12),transparent_36%)]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-16">
        <section className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-black tracking-[0.3em] text-yellow-300">
            KESSAN TANTEI PRO
          </p>

          <h1 className="mt-4 text-4xl font-black leading-tight sm:text-6xl">
            全順位と判定根拠を、
            <br />
            最後まで確認する。
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
            Proでは、ランキング全順位・判定根拠・警戒シグナル内訳・決算変化を同じ画面体系で確認できます。
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm font-bold">
            <span className="rounded-full border border-green-400/30 bg-green-500/10 px-4 py-2 text-green-200">
              TOP3は無料
            </span>
            <span className="rounded-full border border-yellow-400/30 bg-yellow-500/10 px-4 py-2 text-yellow-200">
              4位以降はPro
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-300">
              初月100円
            </span>
          </div>
        </section>

        <section className="mt-12 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black">Free</h2>
                <p className="mt-2 text-slate-400">主要指標とTOP3を確認</p>
              </div>
              <p className="text-4xl font-black">¥0</p>
            </div>

            <div className="mt-8 space-y-3">
              {freeFeatures.map(([title, description]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <p className="font-black text-white">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    {description}
                  </p>
                </div>
              ))}
            </div>

            <Link
              href="/ranking"
              className="mt-8 flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-black/30 px-5 py-3 text-center font-black text-white transition hover:bg-white/10 active:scale-95"
            >
              無料ランキングを見る
            </Link>
          </div>

          <div className="overflow-hidden rounded-3xl border border-yellow-300/40 bg-gradient-to-br from-yellow-400/20 via-yellow-400/10 to-white/[0.04] p-[1px] shadow-2xl shadow-yellow-950/30">
            <div className="h-full rounded-3xl bg-[#080b14]/90 p-6 backdrop-blur-xl sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="inline-flex rounded-full bg-yellow-400 px-3 py-1 text-xs font-black text-slate-950">
                    FULL ACCESS
                  </div>
                  <h2 className="mt-4 text-3xl font-black text-yellow-200">Pro</h2>
                  <p className="mt-2 text-slate-300">
                    全順位・判定根拠・比較データを開放
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm font-bold text-yellow-200">初月</p>
                  <p className="text-5xl font-black">¥100</p>
                  <p className="mt-1 text-sm text-slate-400">
                    2ヶ月目以降 ¥980/月
                  </p>
                </div>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {proFeatures.map(([title, description]) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4"
                  >
                    <p className="font-black text-yellow-100">✓ {title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      {description}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-7 rounded-2xl border border-yellow-400/25 bg-black/25 p-4 text-sm leading-7 text-slate-300">
                Proプランは月額サブスクリプションです。初月のみ100円、2ヶ月目以降は月額980円で自動更新されます。いつでも解約できます。
              </div>

              <div className="mt-5 flex flex-wrap gap-3 text-sm text-yellow-200">
                <Link href="/terms" className="underline underline-offset-4">
                  利用規約
                </Link>
                <Link href="/privacy" className="underline underline-offset-4">
                  プライバシーポリシー
                </Link>
                <Link href="/disclaimer" className="underline underline-offset-4">
                  免責事項
                </Link>
                <Link href="/legal" className="underline underline-offset-4">
                  特商法表記
                </Link>
              </div>

              {userId ? (
                <form action={createCheckoutSession} className="mt-8">
                  <TermsSubmitButton />
                </form>
              ) : (
                <div className="mt-8 rounded-2xl border border-white/10 bg-black/25 p-5">
                  <p className="text-sm leading-7 text-slate-300">
                    Pro登録にはログインが必要です。画面右下の「Googleでログイン」からログイン後、このページに戻って登録してください。
                  </p>
                  <Link
                    href="/ranking"
                    className="mt-4 flex min-h-12 items-center justify-center rounded-full bg-yellow-400 px-5 py-3 text-center font-black text-slate-950 transition hover:bg-yellow-300 active:scale-95"
                  >
                    先にランキングを見る
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black tracking-[0.28em] text-green-300">
                COMPARISON
              </p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">
                Free / Pro
              </h2>
            </div>
            <p className="text-sm leading-6 text-slate-400">
              表示範囲の違いを機能単位で比較します。
            </p>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr] bg-white/10 text-sm font-black text-slate-200">
              <div className="p-4">機能</div>
              <div className="p-4 text-center">Free</div>
              <div className="p-4 text-center text-yellow-200">Pro</div>
            </div>

            {[
              ["ランキングTOP3", "○", "○"],
              ["4位以降の全順位", "—", "○"],
              ["判定根拠", "一部", "○"],
              ["企業ページの基本情報", "○", "○"],
              ["詳細判定", "一部", "○"],
              ["警戒シグナル内訳", "—", "○"],
              ["決算変化", "—", "○"],
              ["関連ランキング", "一部", "○"],
            ].map(([feature, free, pro]) => (
              <div
                key={feature}
                className="grid grid-cols-[1.2fr_0.8fr_0.8fr] border-t border-white/10 text-sm text-slate-300"
              >
                <div className="p-4 font-bold text-white">{feature}</div>
                <div className="p-4 text-center">{free}</div>
                <div className="p-4 text-center font-black text-yellow-200">
                  {pro}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-green-400/20 bg-green-500/10 p-6">
            <p className="text-3xl">🏆</p>
            <h3 className="mt-4 text-xl font-black">ランキング全件</h3>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              TOP3だけでなく、4位以降の会社名と指標値まで確認できます。
            </p>
          </div>

          <div className="rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-6">
            <p className="text-3xl">📊</p>
            <h3 className="mt-4 text-xl font-black">判定根拠</h3>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              プラス材料・警戒材料・根拠数値・次回確認項目を固定フォーマットで確認できます。
            </p>
          </div>

          <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-6">
            <p className="text-3xl">⚠</p>
            <h3 className="mt-4 text-xl font-black">警戒シグナル内訳</h3>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              資金繰り、希薄化、営業CFなどDanger Scoreを構成する項目とスコア影響を確認できます。
            </p>
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-white/10 bg-[#07111f] p-6 sm:p-8">
          <p className="text-xs font-black tracking-[0.28em] text-yellow-300">FAQ</p>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">よくある質問</h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {faqs.map((faq) => (
              <div
                key={faq.question}
                className="rounded-2xl border border-white/10 bg-white/5 p-5"
              >
                <h3 className="font-black text-white">{faq.question}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-yellow-300/30 bg-yellow-400/10 p-6 text-center sm:p-8">
          <p className="text-sm font-black tracking-[0.25em] text-yellow-200">
            START PRO
          </p>
          <h2 className="mt-3 text-2xl font-black sm:text-4xl">
            初月100円で全順位と判定根拠を開放。
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            決算探偵は、公式開示データを固定ルールで整理・比較するための分析ツールです。
          </p>

          {userId ? (
            <form action={createCheckoutSession} className="mt-7">
              <TermsSubmitButton />
            </form>
          ) : (
            <Link
              href="/ranking"
              className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-yellow-400 px-8 py-3 font-black text-slate-950 transition hover:bg-yellow-300 active:scale-95"
            >
              無料ランキングを見る
            </Link>
          )}
        </section>
      </div>
    </main>
  );
}
