import Link from "next/link";

export default function LegalPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-2xl font-black">決算探偵</Link>

        <h1 className="mt-8 text-4xl font-black">
          特定商取引法に基づく表記
        </h1>

        <div className="mt-8 space-y-5 leading-8 text-slate-300">
          <p>事業者名：決算探偵</p>
          <p>運営責任者：請求があった場合、遅滞なく開示します。</p>
          <p>所在地：請求があった場合、遅滞なく開示します。</p>
          <p>連絡先：kessan.tantei@gmail.com</p>
          <p>販売価格：Proプラン 初月100円、2ヶ月目以降 月額980円</p>
          <p>支払方法：クレジットカード決済（Stripe）</p>
          <p>支払時期：申込時および以後毎月自動更新時</p>
          <p>サービス提供時期：決済完了後、直ちに利用可能</p>
          <p>解約方法：プロフィールまたはStripeの管理画面から解約できます。</p>
          <p>返金：サービスの性質上、原則として返金は行いません。</p>
        </div>
      </div>
    </main>
  );
}