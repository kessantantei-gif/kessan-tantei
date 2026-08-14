import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/markets" className="text-2xl font-black">
          決算探偵
        </Link>

        <h1 className="mt-8 text-4xl font-black">利用規約</h1>

        <div className="mt-8 space-y-7 leading-8 text-slate-300">
          <p>
            本利用規約は、決算探偵が提供する日本株の財務分析・ランキング・掲示板等のサービスの利用条件を定めるものです。
            本サービスを利用した場合、本規約に同意したものとみなします。
          </p>

          <section>
            <h2 className="text-2xl font-bold text-white">第1条 サービス内容</h2>
            <p className="mt-3">
              本サービスは、EDINET、TDnetその他の公開情報等をもとにした財務分析、Financial Score、Danger Score、警戒シグナル、AI決算コメント、ランキング、ニュース、掲示板その他の情報提供機能を提供します。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">第2条 投資判断</h2>
            <p className="mt-3">
              本サービスは投資助言、投資勧誘または個別銘柄の売買推奨を目的とするものではありません。投資判断は利用者自身の責任で行ってください。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">第3条 Proプラン</h2>
            <p className="mt-3">
              Proプランは月額サブスクリプションです。料金、キャンペーンその他の条件は申込画面に表示する内容が適用されます。
              自動更新を停止しない限り、各契約期間の終了時に更新されます。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">第4条 解約・返金</h2>
            <p className="mt-3">
              利用者は所定の方法でProプランを解約できます。解約後も支払済み期間の終了までは利用できます。
              支払済み料金は、法令上返金が必要な場合を除き、原則として返金しません。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">第5条 掲示板</h2>
            <div className="mt-3 space-y-3">
              <p>
                掲示板への投稿は投稿者自身の責任で行うものとし、投稿内容は投稿者個人の見解です。決算探偵は、利用者の投稿を承認、保証、推奨するものではありません。
              </p>
              <p>
                投稿者は、投稿内容について必要な権利を有し、かつ第三者の権利や法令を侵害しないことを確認したうえで投稿してください。
              </p>
              <p>
                掲示板の利用には、別途定める
                <Link href="/community-guidelines" className="mx-1 font-bold text-cyan-300 hover:text-cyan-200">
                  掲示板ガイドライン
                </Link>
                が適用されます。
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">第6条 禁止事項</h2>
            <p className="mt-3">利用者は、次の行為をしてはなりません。</p>
            <ul className="mt-3 space-y-2 rounded-2xl border border-red-400/20 bg-red-500/10 p-5">
              <li>・虚偽情報、合理的な根拠のない噂または誤解を招く情報を、金融商品の売買または相場変動を図る目的で流布する行為</li>
              <li>・特定銘柄の価格を人為的に動かすことを目的とした投稿、買付け・売付けの呼びかけ、示し合わせその他の相場操縦につながる行為</li>
              <li>・未公表の重要事実その他、法令上公表・利用が制限される情報を投稿または利用する行為</li>
              <li>・他者への誹謗中傷、名誉・信用・プライバシーの侵害、個人情報の掲載、なりすまし</li>
              <li>・著作権、商標権その他の第三者の権利を侵害する行為</li>
              <li>・広告、勧誘、スパム、過度な連続投稿、不正アクセスその他サービス運営を妨害する行為</li>
              <li>・有料コンテンツその他本サービスのコンテンツを、許可なく転載、複製、配布または第三者共有する行為</li>
              <li>・その他、法令、公序良俗、本規約または掲示板ガイドラインに違反する行為</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">第7条 投稿の非表示・削除・利用制限</h2>
            <p className="mt-3">
              運営は、投稿が法令、本規約または掲示板ガイドラインに違反するおそれがある場合、権利侵害の申出を受けた場合、サービスの安全な運営に必要な場合その他合理的な理由がある場合に、事前の通知なく投稿を非表示・削除し、投稿機能またはアカウントの利用を制限することがあります。
            </p>
            <p className="mt-3">
              通報数は判断材料の一つであり、通報数だけをもって違反の有無を確定するものではありません。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">第8条 権利侵害等の申出</h2>
            <p className="mt-3">
              掲示板投稿により名誉、プライバシー、著作権その他の権利を侵害されたと考える方、または違法行為が疑われる投稿を発見した方は、掲示板の通報機能または所定の問い合わせ窓口から申出を行うことができます。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">第9条 投稿情報・記録の取扱い</h2>
            <p className="mt-3">
              運営は、不正利用防止、掲示板の管理、紛争・権利侵害への対応、法令上の義務への対応等のため、投稿内容、アカウント識別子、通報・操作履歴その他必要な情報を保存することがあります。
              法令に基づく適法な照会、開示命令その他の手続がある場合は、法令に従って対応します。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">第10条 サービスの変更・停止</h2>
            <p className="mt-3">
              運営は、保守、障害対応、法令対応その他必要な場合に、本サービスの全部または一部を変更、停止または終了することがあります。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">第11条 免責</h2>
            <p className="mt-3">
              本サービスの情報の正確性、完全性、最新性または特定目的への適合性を保証するものではありません。
              運営の責任を免除することが法令上認められない場合を除き、本サービスの利用により生じた損害については、法令上認められる範囲で責任を負わないものとします。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">第12条 規約の変更</h2>
            <p className="mt-3">
              運営は、法令に従い、必要に応じて本規約を変更することがあります。重要な変更については、本サービス上で分かりやすい方法により告知します。
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
