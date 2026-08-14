import Link from "next/link";

export default function DisclaimerPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-2xl font-black">
          決算探偵
        </Link>

        <h1 className="mt-8 text-4xl font-black">免責事項</h1>

        <div className="mt-8 space-y-7 leading-8 text-slate-300">
          <p>
            本サービスは投資助言、投資勧誘または個別銘柄の売買推奨を目的とするものではありません。
          </p>

          <section>
            <h2 className="text-2xl font-bold text-white">投資判断について</h2>
            <p className="mt-3">
              投資判断は利用者自身の責任で行ってください。本サービス上のスコア、ランキング、分析コメント、掲示板投稿その他の情報だけを根拠として売買判断を行うことを推奨しません。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">情報の正確性</h2>
            <p className="mt-3">
              本サービスは公開情報をもとに機械的分析等を行いますが、情報の正確性、完全性、適時性を保証しません。重要な投資判断では、発行会社の適時開示、法定開示その他の一次情報を確認してください。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">AI決算コメントについて</h2>
            <p className="mt-3">
              AI決算コメントは取得済みの財務データ等を理解するための補助情報であり、将来の株価、業績、投資成果を予測または保証するものではありません。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">掲示板について</h2>
            <p className="mt-3">
              掲示板投稿は投稿者個人の見解であり、決算探偵が投稿内容を作成、承認、保証または推奨するものではありません。
              虚偽情報、合理的な根拠のない噂、相場操縦につながる投稿、権利侵害その他の禁止事項については掲示板ガイドラインを確認してください。
            </p>
            <Link
              href="/community-guidelines"
              className="mt-3 inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-200 hover:bg-cyan-400/20"
            >
              掲示板ガイドライン
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
