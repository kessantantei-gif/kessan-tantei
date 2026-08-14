import Link from "next/link";

const prohibitedItems = [
  "合理的な根拠のない噂、虚偽情報、誤解を招く情報を、株価や売買に影響を与える目的で投稿すること",
  "『関係者から聞いた』『明日発表される』など、確認できない未公表情報を事実であるかのように投稿すること",
  "特定銘柄の価格を動かす目的で、買付け・売付け・投稿を呼びかけたり、複数人で示し合わせたりすること",
  "未公表の重要事実その他、法令上公表・利用が制限される情報を投稿すること",
  "企業、役職員、他の利用者その他の第三者への誹謗中傷、名誉・信用の侵害、個人情報の掲載、なりすまし",
  "著作権その他の権利を侵害する転載、広告・勧誘、スパム、同一内容の連続投稿",
  "その他、法令、公序良俗、本ガイドラインまたは利用規約に違反し、運営上不適切と判断される投稿",
] as const;

const postingRules = [
  "事実を書く場合は、決算短信・適時開示・有価証券報告書など確認可能な根拠を示してください。",
  "推測や予想は、事実と混同しないよう『予想』『個人的な見方』であることを明確にしてください。",
  "将来の株価、TOB、上方修正、提携などを断定する表現は、公式発表など合理的な根拠がない限り避けてください。",
  "保有・売買の有無にかかわらず、他の利用者を誤認させる目的で情報を投稿しないでください。",
] as const;

export default function CommunityGuidelinesPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-2xl font-black">
          決算探偵
        </Link>

        <div className="mt-8 rounded-3xl border border-cyan-300/20 bg-cyan-500/10 p-6 sm:p-8">
          <p className="text-xs font-black tracking-[0.28em] text-cyan-300">COMMUNITY RULES</p>
          <h1 className="mt-3 text-4xl font-black">掲示板ガイドライン</h1>
          <p className="mt-4 leading-8 text-slate-300">
            決算探偵の掲示板は、決算や開示資料について利用者同士で論点を共有するための場所です。
            投稿は各利用者の責任で行われ、決算探偵が投稿内容を承認、保証、推奨するものではありません。
          </p>
        </div>

        <div className="mt-8 space-y-8 leading-8 text-slate-300">
          <section>
            <h2 className="text-2xl font-bold text-white">禁止する投稿・行為</h2>
            <div className="mt-4 rounded-3xl border border-red-400/20 bg-red-500/10 p-5 sm:p-6">
              <ol className="space-y-3">
                {prohibitedItems.map((item, index) => (
                  <li key={item}>
                    <span className="mr-2 font-black text-red-200">{index + 1}.</span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">投稿するときの基本ルール</h2>
            <ul className="mt-4 space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
              {postingRules.map((item) => (
                <li key={item}>・{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">通報・非表示・削除</h2>
            <p className="mt-3">
              各投稿には通報機能があります。一定数の通報が集まった投稿は自動的に非表示となる場合があります。
              また、法令・利用規約・本ガイドラインへの違反が疑われる場合、運営は通報数にかかわらず投稿の非表示・削除、利用制限その他必要な措置を行うことがあります。
            </p>
          </section>

          <section id="report">
            <h2 className="text-2xl font-bold text-white">権利侵害・違法投稿の削除申請</h2>
            <p className="mt-3">
              名誉・プライバシー・著作権等の権利侵害、風説の流布その他の違法行為が疑われる投稿については、
              投稿の「通報」に加え、画面左下の問い合わせフォームから
              <strong className="text-white">「掲示板・権利侵害の通報」</strong>を選択してご連絡ください。
            </p>
            <p className="mt-3 rounded-2xl border border-yellow-300/20 bg-yellow-400/10 p-4 text-yellow-100">
              対象銘柄、投稿番号または投稿日時、ページURL、問題となる箇所、削除を求める理由を記載してください。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">記録の保存等</h2>
            <p className="mt-3">
              不正利用防止、紛争対応、権利侵害への対応、法令上の義務への対応のため、投稿、アカウント識別子、通報・操作履歴等を必要な範囲で保存することがあります。
              法令に基づく適法な照会・開示請求等がある場合は、法令に従って対応します。
            </p>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-xl font-bold text-white">関連ページ</h2>
            <div className="mt-4 flex flex-wrap gap-3 text-sm font-bold">
              <Link href="/terms" className="rounded-full border border-white/10 px-4 py-2 hover:bg-white/10">
                利用規約
              </Link>
              <Link href="/privacy" className="rounded-full border border-white/10 px-4 py-2 hover:bg-white/10">
                プライバシーポリシー
              </Link>
              <Link href="/disclaimer" className="rounded-full border border-white/10 px-4 py-2 hover:bg-white/10">
                免責事項
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
