import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-2xl font-black">決算探偵</Link>

        <h1 className="mt-8 text-4xl font-black">プライバシーポリシー</h1>

        <div className="mt-8 space-y-6 leading-8 text-slate-300">
          <p>
            決算探偵は、ユーザーの個人情報を適切に取り扱います。
          </p>

          <section>
            <h2 className="text-2xl font-bold text-white">取得する情報</h2>
            <p className="mt-3">
              Googleログイン情報、メールアドレス、プロフィール情報、利用履歴、ウォッチリスト、決済状態を取得します。
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
            <p className="mt-3">
              本サービスの提供、本人確認、課金管理、不正利用防止、サービス改善のために利用します。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">外部サービス</h2>
            <p className="mt-3">
              本サービスでは、Clerk、Supabase、Stripe、Vercel等の外部サービスを利用します。
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}