import Spinner from "@/components/spinner";

export default function Loading() {
  return (
    <div className="min-h-[55vh] bg-[#050816] px-4 py-10 text-white" role="status" aria-live="polite">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-5 rounded-3xl border border-white/10 bg-white/5 px-6 py-16 text-center shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-green-400/30 bg-green-500/10 text-green-300 shadow-lg shadow-green-500/10">
          <span className="scale-150">
            <Spinner />
          </span>
        </div>
        <div>
          <p className="text-lg font-black">決算データを読み込んでいます</p>
          <p className="mt-2 text-sm text-slate-400">画面を切り替えています...</p>
        </div>
        <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
          <div className="navigation-progress-bar h-full rounded-full bg-green-400" />
        </div>
      </div>
    </div>
  );
}
