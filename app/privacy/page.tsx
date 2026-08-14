import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-2xl font-black">
          決算探偵
        </Link>

        <h1 className="mt-8 text-4xl font-black">プライバシーポリシー</h1>

        <div className="mt-8 space-y-7 leading-8 text-slate-300">
          <p>
            決算探偵は、本サービスの提供に必要な範囲で利用者に関する情報を取得し、適切に取り扱います。
          </p>

          <section>
            <h2 className="text-2xl font-bold text-white">取得する情報</h2>
            <ul className="mt-3 space-y-2">
              <li>・ログインに利用するアカウント識別子、メールアドレス、表示名その他のプロフィール情報</li>
              <li>・ウォッチリスト、閲覧・利用履歴、Proプランの契約・決済状態</li>
              <li>・掲示板への投稿内容、返信関係、いいね・通報その他の操作履歴</li>
              <li>・問い合わせ内容、返信先として入力されたメールアドレス</li>
              <li>・不正利用防止やサービス運用に必要なアクセスログ等の技術情報</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">掲示板情報の取扱い</h2>
            <p className="mt-3">
              掲示板では、投稿本文と表示名が他の利用者に公開されます。ログインに利用する内部のアカウント識別子やメールアドレスを、通常の掲示板画面上に公開することはありません。
            </p>
            <p className="mt-3">
              不正利用防止、投稿の管理、権利侵害・紛争への対応、法令上の義務への対応のため、削除・非表示となった投稿を含め、投稿内容、アカウント識別子、通報・操作履歴等を必要な範囲で保存することがあります。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">決済情報</h2>
            <p className="mt-3">
              クレジットカード情報はStripeが管理し、決算探偵はカード番号を保存しません。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">利用目的</h2>
            <ul className="mt-3 space-y-2">
              <li>・本サービスの提供、本人確認、アカウント管理、課金管理</li>
              <li>・掲示板の投稿・通報機能の提供、違反投稿の確認、利用制限等のモデレーション</li>
              <li>・不正利用、セキュリティ上の問題、スパムその他の迷惑行為の防止</li>
              <li>・権利侵害の申出、問い合わせ、紛争、法令上の手続への対応</li>
              <li>・利用状況の分析、サービス品質の改善</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">外部サービス</h2>
            <p className="mt-3">
              本サービスでは、Clerk、Supabase、Stripe、Vercel、Resend等の外部サービスを利用します。
              これらの事業者は、それぞれのサービス提供に必要な範囲で情報を取り扱う場合があります。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">第三者提供・法令への対応</h2>
            <p className="mt-3">
              法令に基づく場合、本人の同意がある場合その他法令上認められる場合を除き、個人データを第三者に提供しません。
              裁判所、捜査機関その他の公的機関から法令に基づく適法な照会・開示命令等を受けた場合は、法令に従って対応します。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">問い合わせ</h2>
            <p className="mt-3">
              個人情報の取扱い、掲示板上の権利侵害その他の問い合わせは、画面左下の問い合わせフォームからご連絡ください。
              掲示板に関する申出は「掲示板・権利侵害の通報」を選択してください。
            </p>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <Link href="/community-guidelines" className="font-bold text-cyan-300 hover:text-cyan-200">
              掲示板ガイドラインを確認する →
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
