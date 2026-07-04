import Link from "next/link";

export default function DisclaimerPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-2xl font-black">決算探偵</Link>

        <h1 className="mt-8 text-4xl font-black">免責事項</h1>

        <div className="mt-8 space-y-6 leading-8 text-slate-300">
          <p>
            本サービスは投資助言、投資勧誘、売買推奨を目的とするものではありません。
          </p>

          <section>
            <h2 className="text-2xl font-bold text-white">投資判断について</h2>
            <p className="mt-3">
              投資判断はユーザー自身の責任で行ってください。本サービスの情報を利用した結果生じたいかなる損失についても、運営者は責任を負いません。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">情報の正確性</h2>
            <p className="mt-3">
              本サービスは公開情報をもとに機械的分析を行いますが、情報の正確性、完全性、適時性を保証しません。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white">AI分析について</h2>
            <p className="mt-3">
              AI分析は参考情報であり、将来の株価、業績、投資成果を保証するものではありません。
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}