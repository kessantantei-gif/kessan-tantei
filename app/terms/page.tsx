import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/markets" className="text-2xl font-black">決算探偵</Link>

        <h1 className="mt-8 text-4xl font-black">利用規約</h1>

        <div className="mt-8 space-y-6 leading-8 text-slate-300">
          <p>
            本利用規約は、決算探偵が提供する日本株全市場対応の財務分析サービスの利用条件を定めるものです。
          </p>

          <section>
            <h2 className="text-2xl font-bold text-white">第1条 サービス内容</h2>
            <p className="mt-3">
              本サービスは、EDINET等の公開情報をもとに、財務スコア、Red Flags、ニュース、掲示板、AI分析等を提供します。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">第2条 Proプラン</h2>
            <p className="mt-3">
              Proプランは月額サブスクリプションです。初月は100円、2ヶ月目以降は月額980円で自動更新されます。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">第3条 解約</h2>
            <p className="mt-3">
              ユーザーはいつでも解約できます。解約後も支払済み期間の終了まではPro機能を利用できます。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">第4条 返金</h2>
            <p className="mt-3">
              原則として、支払済み料金の返金は行いません。ただし、法令上必要な場合を除きます。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">第5条 禁止事項</h2>
            <p className="mt-3">
              AI分析、ランキング、財務異変検知、その他有料コンテンツの転載、複製、配布、第三者共有を禁止します。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">第6条 アカウント停止</h2>
            <p className="mt-3">
              不正利用、転載、過度なアクセス、その他運営が不適切と判断した行為があった場合、アカウントを停止することがあります。
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
